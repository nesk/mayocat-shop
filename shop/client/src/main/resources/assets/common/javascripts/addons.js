/*
 * Copyright (c) 2012, Mayocat <hello@mayocat.org>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
(function () {

    'use strict'

    /**
     * Helper function that creates an "extended" group definition from an actual server provided group definition.
     * This extended definition is used when listing groups on entity pages.
     *
     * @param group the group definition to get the extended group definition for
     * @param groupKey the key of the group
     * @param sourceName the name of the source for this group definition (for example "platform" or "theme"
     * @returns {Object} the extended group definition
     */
    function getExtendedGroupDefinition(group, groupKey, sourceName) {
        var definition = angular.copy(group);
        definition.key = groupKey;
        definition.source = sourceName;
        definition.fields = [];
        definition.getValueShell = function() {
            // Used for sequence addons, to get a "shell" value with all fields having a
            // null value when adding a new item in the sequence
            var object = {};
            Object.keys(group.fields).forEach(function(key){
                object[key] = null;
            });
            return object;
        }
        return definition
    }

    angular.module('mayocat.addons', ['ngResource'])

        .factory('addonsService', function ($resource, $q, configurationService) {

            // Map of "addon type" -> "default editor"
            var defaultEditors = {
                "html":"wyswiyg",
                "string":"string",
                "json":"textarea"
            };

            // List of registered editors
            var editors = {};

            // See below in the function exports
            var registerEditor = function (key, editor) {
                if (editors[key] === undefined) {
                    editors[key] = editor;
                }
                else {
                    console.warn("Editor [" + key + "] is already registered.");
                }
            }

            // Register default editors supported by the platform
            // - Select box
            registerEditor("string", {
                tagName:"input",
                type:"string",
                extraAttributes:"type='text'"
            });
            registerEditor("textarea", {
                tagName:"textarea",
                closingTag:true,
                type:"string"
            });
            registerEditor("wysiwyg", {
                tagName:"textarea",
                closingTag:true,
                type:"html",
                extraAttributes:"ck-editor"
            });
            registerEditor("selectBox", {
                tagName:"select",
                type:"string",
                extraAttributes:"ng-options='value.key || value as value.name || value for value in addon.properties[\"list.values\"]'",
                postProcess:function (string) {
                    return "<div>" + string + "</div>"
                }
            });
            registerEditor("radioBox", {
                tagName:"addon-radio",
                type:"string",
                extraAttributes:"options='addon.properties[\"list.values\"]'"
            });
            registerEditor("checkBox", {
                tagName:"addon-checkbox",
                type:"json",
                extraAttributes:"options='addon.properties[\"list.values\"]'"
            });
            registerEditor("image", {
                tagName:"addon-image",
                type:"image"
            });
            registerEditor("color", {
                tagName:"addon-color",
                type:"json",
                extraAttributes:'formats="addon.properties.formats" color-prefix="addon.properties.colorPrefix" options="addon.properties[\'jquery.colorpicker\']"'
            });

            return {

                /**
                 * Adds an editor in the list of registered editor.
                 *
                 * @param key the key under which to register this editor. For example "selectBox".
                 * @param editor the editor configuration object.
                 */
                registerEditor:registerEditor,


                /**
                 * Returns the type of data to use for an addon.
                 *
                 * @param type the type defined in the addon field definition. May be null
                 * @param editor the editor to use.
                 */
                type:function (type, editor) {
                    if (typeof type !== 'undefined' && type !== null) {
                        return type;
                    }
                    if (typeof editors[editor] !== "undefined") {
                        return editors[editor].type;
                    }
                    return "string";
                },

                /**
                 * Obtain the editor ng-html code to display for the passed type and definition of addon.
                 * If no editor is passed in the definition, the default editor for the passed type is looked up
                 * and used (for example, type "string" uses a editor that creates a standard input type string).
                 *
                 * @param {string} type the type of addon field (i.e. "string" or "html" or "json", etc.).
                 * @param {object} definition the addon field definition object.
                 * @param {object} options an optional option hash
                 * @returns {string}
                 */
                editor:function (type, definition, options) {

                    // Safeguards against undefined addon definition and options
                    definition = typeof definition !== "undefined" ? definition : {};
                    options = typeof options !== "undefined" ? options : {};

                    var editor = definition.editor || type,
                        output = "",
                        tagName;

                    if (typeof editor === "undefined") {
                        editor = defaultEditors[type];
                    }

                    tagName = editors[editor].tagName;

                    output += "<" + tagName;

                    if (typeof definition.properties !== "undefined" && !!definition.properties.localized) {
                        output += " ng-model=localizedObject[key] ";
                    }
                    else {
                        output += " ng-model=object[key] ";
                    }

                    if (typeof editors[editor].extraAttributes !== "undefined") {
                        if (typeof editors[editor].extraAttributes === "function") {
                            output += editors[editor].extraAttributes();
                        }
                        else {
                            output += editors[editor].extraAttributes;
                        }
                        output += " "; // safety guard
                    }

                    if (typeof definition.properties !== "undefined" && !!definition.properties.localized) {
                        output += "localized ";
                    }

                    if (typeof definition.placeholder !== "undefined") {
                        output += " placeholder={{addon.placeholder}} ";
                    }

                    if (typeof definition.properties !== "undefined" && !!definition.properties.readOnly
                        && !options.ignoreReadOnly) {
                        output += "disabled='disabled' "
                    }

                    output += ">";

                    if (editors[editor].closingTag) {
                        output += "</";
                        output += tagName;
                        output += '>';
                    }

                    if (typeof editors[editor].postProcess === "function") {
                        output = editors[editor].postProcess(output);
                    }

                    return output;
                },

                /**
                 * Initializes the list of addons for an entity
                 *
                 * @param entityType the type of entity to initialize. For example "page" or "product", or "user" etc.
                 * @param entity the actual entity object to initialize addons for
                 * @param options an hash with additional options. Supported options:
                 * <ul>
                 *     <li><code>getDefinition</code>: an optional function to get the actual desired addons definition
                 *     from the entity definition. This is useful for example when initializing a sub-entity addons,
                 *     like addons for product variants or features for a product type definition.</li>
                 * </ul>
                 * @returns {Object} the promise of this realization
                 */
                initializeEntityAddons: function (entityType, entity, options) {

                    options = typeof options === "undefined" ? {} : options;

                    var entityAddons = [],
                        deferred = $q.defer();

                    configurationService.get(function (configuration) {
                        var entities = configuration.entities,
                            locales = configuration.general.locales.others || [];

                        if (typeof entities === 'undefined' || typeof entities[entityType] === 'undefined') {
                            deferred.resolve(entityAddons);
                        }

                        if (typeof entity._localized === "undefined") {
                            entity._localized = {};
                        }
                        locales.forEach(function (locale) {
                            if (typeof entity._localized[locale] === "undefined") {
                                entity._localized[locale] = {};
                            }
                            if (typeof entity._localized[locale].addons === "undefined") {
                                entity._localized[locale].addons = {};
                            }
                        });

                        var addons;
                        if (typeof options.getDefinition === "function") {
                            addons = options.getDefinition.call(this, entities[entityType]);
                        } else {
                            addons = entities[entityType].addons
                        }

                        addons && Object.keys(addons).forEach(function(sourceName) {
                            var source = addons[sourceName];

                            if (typeof entity.addons === "undefined") {
                                entity.addons = {};
                            }

                            Object.keys(source).forEach(function(groupKey){
                                var group = source[groupKey],
                                    definitions = group.fields,
                                    sequence = group.sequence,
                                    definitionKeys = Object.keys(definitions),
                                    addonGroupDefinition = getExtendedGroupDefinition(group, groupKey, sourceName);

                                entityAddons.push(addonGroupDefinition);

                                if (typeof entity.addons[groupKey] === "undefined") {
                                    entity.addons[groupKey] = {
                                        group: groupKey,
                                        source: sourceName,
                                        value: sequence ? [] : {},
                                        model: {}
                                    }
                                }
                                else if (sequence && !entity.addons[groupKey].value instanceof Array) {
                                    // If the addon definition says it's a sequence and the value is not a list, put
                                    // it as a first item of the list.
                                    // (This could happen if the theme developer changes the definition after setting a
                                    // value).

                                    entity.addons[groupKey].value = [ entity.addons[groupKey].value ];
                                }
                                else if (!sequence && entity.addons[groupKey].value instanceof Array) {
                                    // Same: if the addon definition says it's a not sequence and the value is a list,
                                    // take the first object in the list if there's one, or put an empty object.

                                    if (entity.addons[groupKey].value.length > 0) {
                                        entity.addons[groupKey].value = entity.addons[groupKey].value[0];
                                    }
                                    else {
                                        entity.addons[groupKey].value = {};
                                    }
                                }

                                var fieldSequence = sequence ?
                                    entity.addons[groupKey].value : [ entity.addons[groupKey].value ];

                                fieldSequence.forEach(function (sequence) {
                                    // Initialize all field values with "null" if not present

                                    definitionKeys.forEach(function (key) {
                                        if (typeof sequence[key] === 'undefined') {
                                            sequence[key] = null;
                                        }
                                    });
                                });

                                definitionKeys.forEach(function (key) {
                                    var definition = definitions[key];

                                    if (typeof definition.properties !== 'undefined'
                                        && typeof definition.properties.listValues !== 'undefined') {
                                        // Backward compatibility : "list.values" property used to be "listValues"
                                        definition.properties['list.values'] = definition.properties.listValues;
                                    }

                                    if (typeof entity.addons[groupKey].model === 'undefined') {
                                        entity.addons[groupKey].model = {}
                                    }

                                    entity.addons[groupKey].model[key] = { "type": definition.type };

                                    addonGroupDefinition.fields.push({
                                        key: key,
                                        definition: definition
                                    });
                                });

                            });
                        });

                        // Initialize localized copies

                        if (typeof entity.addons === "undefined") {
                            entity.addons = {};
                        }

                        Object.keys(entity.addons).forEach(function (groupKey) {

                            var group = entity.addons[groupKey];
                            locales.forEach(function (locale) {
                                if (typeof entity._localized[locale].addons === 'undefined') {
                                    entity._localized[locale].addons = {};
                                }

                                var localizedGroup = entity._localized[locale].addons[groupKey];
                                if (typeof localizedGroup === 'undefined') {
                                    localizedGroup = angular.copy(group);

                                    // Localized version of the addon does not exist yet : we create it

                                    if (!localizedGroup.value instanceof Array) {
                                        // Non-sequence
                                        Object.keys(localizedGroup.value).forEach(function (key) {
                                            localizedGroup.value[key] = null;
                                        });
                                    }
                                    else {
                                        // Sequence
                                        localizedGroup.value = [];
                                    }
                                } else {
                                    // Localized version already exist. Check if consistent

                                    if (group.value instanceof Array && !(localizedGroup.value instanceof Array)) {
                                        // The localized version is not an array, but the actual version is, let's fix it
                                        localizedGroup.value = [ localizedGroup.value ];
                                    }

                                    else if (!(group.value instanceof Array) && localizedGroup.value instanceof Array) {
                                        // The localized version is an array but the actual version is not, let's fix it
                                        localizedGroup.value = localizedGroup.value[0] || {};
                                    }
                                }

                                if (typeof localizedGroup.value === 'undefined') {
                                    localizedGroup.value = {};
                                }
                                if (!group.value instanceof Array) {
                                    Object.keys(group.value).forEach(function (key) {
                                        if (typeof localizedGroup.value[key] === 'undefined') {
                                            localizedGroup.value[key] = null;
                                        }
                                    });
                                }

                            });
                        });

                        deferred.resolve(entityAddons);
                    });
                    return deferred.promise;
                }

            }
        })

        .directive('addonList', ['$rootScope', '$timeout', function ($rootScope, $timeout) {
            return {
                restrict: 'E',
                scope: {
                    addons: '=',
                    entity: '=',
                    localized: '=localizedEntity',
                    server: '='
                },
                templateUrl: '/common/partials/addonList.html',
                controller: function ($scope) {

                    $scope.server = $rootScope.server;

                    // The collapsed index hash maps an array of collapsed sequence items positions to a sequenced addon group
                    $scope.collapsedIndexes = {}

                    // Initialize the collapsed index state : by default all items are collapsed, so for all sequenced
                    // groups, we fill the index with all existing positions
                    Object.keys($scope.entity.addons).forEach(function (key) {
                        if ($scope.entity.addons[key].value instanceof Array) {
                            $scope.collapsedIndexes[key] = Array.apply(null, {length: $scope.entity.addons[key].value.length}).map(Number.call, function (n) {
                                return n;
                            });
                        }
                    });

                    // Filters the addons for the current entity.
                    $scope.filterAddons = function(addon) {
                        return !addon.models || addon.models.indexOf($scope.entity.model) >= 0;
                    };

                    /**
                     * Get the sortable options for a sequenced group. On update after a drag and drop, the we rearranged collapsed positions
                     * to match the moved elements.
                     *
                     * @param group
                     * @returns the angular-ui sortable options (See https://github.com/angular-ui/ui-sortable)
                     *
                     */
                    $scope.getSortableOptions = function (group) {
                        return {
                            update: function (e, ui) {
                                var indexBefore = ui.item.scope().$index;
                                $timeout(function () {
                                    var indexAfter = ui.item.scope().$index,
                                        groupIndexes = $scope.collapsedIndexes[group];

                                    if (groupIndexes.indexOf(indexBefore) >= 0 && groupIndexes.indexOf(indexAfter) >= 0) {
                                        // If both index before and after are present, it means we swapped collapsed items
                                        // No need to do anything
                                    }
                                    else if (groupIndexes.indexOf(indexAfter) >= 0) {
                                        groupIndexes.splice(groupIndexes.indexOf(indexAfter), 1);
                                        groupIndexes.push(indexBefore);
                                    }
                                    else if (groupIndexes.indexOf(indexBefore) >= 0) {
                                        groupIndexes.splice(groupIndexes.indexOf(indexBefore), 1);
                                        groupIndexes.push(indexAfter);
                                    }
                                });
                            }
                        }
                    }

                    function getCollapsedElement(type){
                        return function(group, index) {
                            var item = $scope.entity.addons[group].value[index],
                                model = $scope.entity.addons[group].model;
                            var result;
                            Object.keys(item).forEach(function(key){
                                if (typeof result === 'undefined' && typeof model[key] !== 'undefined' && model[key].type === type) {
                                    result = item[key];
                                }
                            });
                            return result || "";
                        }
                    }

                    $scope.getCollapsedText = getCollapsedElement('string');
                    $scope.getCollapsedImage = getCollapsedElement('image');

                    $scope.hasOneImageAddon = function (group) {
                        var model = $scope.entity.addons[group].model;
                        return Object.keys(model).find(function (key) {
                            return model[key].type === 'image';
                        })
                    }

                    $scope.toggleCollapse = function(group, index) {
                        if ($scope.isCollapsed(group, index)) {
                            $scope.collapsedIndexes[group].splice($scope.collapsedIndexes[group].indexOf(index), 1);
                        }
                        else {
                            $scope.collapsedIndexes[group].push(index);
                        }
                    }

                    $scope.isCollapsed = function(group, index) {
                        if (typeof $scope.collapsedIndexes[group] === 'undefined') {
                            return true;
                        }
                        return $scope.collapsedIndexes[group].indexOf(index) >= 0;
                    }

                    $scope.removeSequenceAddonItem = function (group, index) {
                        $scope.entity.addons[group.key].value.splice(index, 1);

                        if (typeof $scope.entity._localized !== 'undefined') {
                            Object.keys($scope.entity._localized).forEach(function (locale) {
                                try {
                                    typeof $scope.entity._localized[locale].addons[group.key].value.splice === 'function'
                                    && $scope.entity._localized[locale].addons[group.key].value.splice(index, 1);
                                } catch (err) {
                                    // Ignore (locale not used anymore, etc.)
                                }
                            });
                        }
                    }

                    $scope.addSequenceAddonItem = function (group) {
                        // First, find out if we want to add at the top or the bottom of the array, checking the conf
                        var insertPosition = typeof group.properties['sequence.newElementPosition'] !== 'undefined' ?
                                group.properties['sequence.newElementPosition'] : 'last',
                            method = insertPosition === 'last' ? 'push' : 'unshift';

                        // Add the element to the addon value array
                        $scope.entity.addons[group.key].value[method](group.getValueShell());

                        // Shift collapsed indexes if necessary
                        if (insertPosition !== 'last') {
                            $scope.collapsedIndexes[group.key] = $scope.collapsedIndexes[group.key].map(function(index){
                                return index + 1;
                            });
                        }

                        // Add it also to all localized versions of the addon value
                        if (typeof $scope.entity._localized !== 'undefined') {
                            Object.keys($scope.entity._localized).forEach(function (locale) {
                                try {
                                    typeof $scope.entity._localized[locale].addons[group.key].value[method] === 'function'
                                    && $scope.entity._localized[locale].addons[group.key].value[method](group.getValueShell());
                                } catch (err) {
                                    // Ignore (locale not used anymore, etc.)
                                }
                            });
                        }
                    }
                }
            };
        }])

        .directive("addon", ['$compile', 'addonsService', function ($compile, addonsService) {
            return {
                scope:{
                    addon: '=definition',
                    object: '=',
                    localizedObject: '=',
                    key: '=',
                    noDropZone: '='
                },
                restrict:"E",
                link:function (scope, element, attrs) {
                    scope.$watch(
                        'addon',
                        function (definition) {
                            scope.type = addonsService.type(definition.type, definition.editor);

                            var editor = addonsService.editor(definition.type, definition, {
                                "ignoreReadOnly":typeof scope.ignoreReadOnly !== 'undefined' ? scope.ignoreReadOnly : false
                            });
                            // The "template" option allow to override default behavior
                            if (typeof definition.template !== 'undefined') {
                                editor = definition.template;
                            }

                            element.html(editor);

                            $compile(element.contents())(scope);
                        }
                    );
                }
            }
        }])

        .directive("addonImage", ['$rootScope', function ($rootScope) {
            return {
                templateUrl: '/common/partials/addonImage.html',
                require : 'ngModel',
                restrict: 'E',
                controller: ['$scope', function ($scope) {
                    $scope.getImageUploadUri = function () {
                        return $rootScope.entity ? ($rootScope.entity.uri + "/attachments") : "";
                    };

                    $rootScope.$on("upload:progress", function(event, memo) {
                        var index = memo.queue.findIndex(function (upload) {
                            return upload.id == $scope.id;
                        });
                        if (index >= 0) {
                            $scope.uploading = true;
                        }
                    });

                    $rootScope.$on("upload:done", function(event, memo) {
                        if (memo.id == $scope.id) {
                            var parts = memo.fileUri.split('/');
                            $scope.internalModel = parts[parts.length - 1];
                            $scope.uploading = false;
                        }
                    });
                }],
                link: function (scope, element, attrs, ngModel) {
                    // Generate a random image list/upload id
                    scope.id = Math.random().toString(36).substring(8);
                    scope.uploading = false;
                    scope.server = $rootScope.server;
                    var clear = scope.$watch("ngModel.$modelValue", function (modelValue) {
                        scope.internalModel = ngModel.$modelValue;
                        clear();
                        scope.$watch("internalModel", function (newValue) {
                            ngModel.$setViewValue(newValue);
                        });
                    });
                }
            }
        }])

        .directive("addonColor", function () {

            $.colorpicker.parts.swatcheslist = function(colorpicker) {

                this.init = function() {
                    var $container = $(colorpicker.dialog).find('.ui-colorpicker-swatcheslist-container'),
                        swatchesKey = colorpicker.options.swatches || 'html',
                        swatches;

                    if (angular.isString(swatchesKey)) {
                        swatches = $.colorpicker.swatches[swatchesKey];
                    } else {
                        swatches = Object.keys(swatchesKey).map(function(name) {
                            return $.extend(swatchesKey[name], { name: name });
                        });
                    }

                    var colorItems = swatches.map(function(swatch) {
                        var rgb = ['r', 'g', 'b'].map(function(channel) {
                            return Math.round(swatch[channel] * 255);
                        });

                        var color = 'rgb(' + rgb.join(',') + ')';

                        return [
                            '<div class="ui-colorpicker-swatch-item" data-color="' + color + '">',
                                '<div style="background-color: ' + color + '"></div>',
                                '<span>' + ($.colorpicker.mayoColorPrefix || '') + swatch.name + '</span>',
                            '</div>',
                        ].join('');
                    }).join('');

                    $container.append($('<div>').addClass('ui-colorpicker-swatcheslist').append(colorItems));

                    $container.find('.ui-colorpicker-swatch-item').on('click', function(event) {
                        var color = $(event.currentTarget).data('color');
                        colorpicker.color = colorpicker._parseColor(color) || new $.colorpicker.Color();
                        colorpicker._change();
                    });
                };

            };

            $.colorpicker.parsers.CMYK = function(color) {
                var match = /^cmyk\(\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?\s*\)$/.exec(color);

                if (match) {
                    var color = new $.colorpicker.Color,
                        channels = match.slice(1).map(function(channel) {
                            return channel / 100;
                        });

                    return color.setCMYK.apply(color, channels);
                }
            };

            $.colorpicker.writers.CMYK = function(color, colorpicker) {
                color = color.getCMYK();
                return [
                    'cmyk(',
                        Math.round(color.c * 100) + ',',
                        Math.round(color.m * 100) + ',',
                        Math.round(color.y * 100) + ',',
                        Math.round(color.k * 100),
                    ')',
                ].join('');
            };

            $.colorpicker.writers['CMYK%'] = function(color, colorpicker) {
                color = color.getCMYK();
                return [
                    'cmyk(',
                        Math.round(color.c * 100) + '%,',
                        Math.round(color.m * 100) + '%,',
                        Math.round(color.y * 100) + '%,',
                        Math.round(color.k * 100) + '%',
                    ')',
                ].join('');
            };

            // Return the exact name with a slight tolerance for color differences
            $.colorpicker.writers.EXACT = function(color, colorpicker) {
                var swatchesKey = colorpicker.options.swatches || 'html',
                    swatches;

                if (angular.isString(swatchesKey)) {
                    swatches = $.colorpicker.swatches[swatchesKey];
                } else {
                    swatches = Object.keys(swatchesKey).map(function(name) {
                        return $.extend(swatchesKey[name], { name: name });
                    });
                }

                var exactColor = swatches.filter(function(swatch) {
                    var colorRGB = color.getRGB();

                    return Math.round(colorRGB.r * 255) === Math.round(swatch.r * 255)
                        && Math.round(colorRGB.g * 255) === Math.round(swatch.g * 255)
                        && Math.round(colorRGB.b * 255) === Math.round(swatch.b * 255);
                })[0];

                return exactColor ? exactColor.name : false;
            };

            function link(scope, element, attrs) {

                $.colorpicker.mayoColorPrefix = scope.colorPrefix;

                // Instantiate the color-picker
                var $input = element.find('input'),
                    $button = element.find('button');

                var colorOptions = $.extend(true, {
                    position: {
                        my: 'left top',
                        at: 'left bottom',
                        of: $button
                    }
                }, scope.options);

                var colorpicker = $input.colorpicker(colorOptions).data('vanderlee-colorpicker');

                colorpicker.option('layout', $.extend(colorpicker.options.layout, {
                    swatcheslist: [
                        5, // 6th column
                        0, // 1st line
                        1, // 1-column wide
                        5  // 5-lines high
                    ]
                }));

                // Display the color-picker when the button is clicked
                $button.on('click', setTimeout.bind(window, colorpicker.open.bind(colorpicker)));

                // Manage color value
                function formatsToColor(formats, formatNames) {
                    if (!angular.isDefined(formats)) return;
                    formatNames = formatNames || scope.formats;

                    function validColorFilter(color) {
                        return color;
                    }

                    function parseFormat(format) {
                        var parsers = $.colorpicker.parsers;

                        return Object.keys(parsers).map(function(parserName) {
                            return parsers[parserName](format, colorpicker);
                        }).filter(validColorFilter)[0];
                    }

                    if (!Array.isArray(formatNames)) {
                        return parseFormat(formats);
                    } else {
                        return Object.keys(formats).map(function(formatKey) {
                            return parseFormat(formats[formatKey]);
                        }).filter(validColorFilter)[0];
                    }
                }

                function colorToFormats(colorObj, formatNames) {
                    formatNames = formatNames || scope.formats;

                    if (!Array.isArray(formatNames)) {
                        var writer = $.colorpicker.writers[String(formatNames).toUpperCase()];
                        return writer ? writer(colorObj, colorpicker) : null;
                    } else {
                        return formatNames.reduce(function(output, formatName) {
                            output[formatName] = colorToFormats(colorObj, formatName);
                            return output;
                        }, {});
                    }
                }

                function convertFormatsTo(formats, formatsNames) {
                    var color = formatsToColor(formats);
                    if (color) return colorToFormats(color, formatsNames);
                }

                $input.on('colorpickerselect', function(event, args) {
                    var colorObj = colorpicker.color,
                        colorChannels = colorObj.getRGB();

                    // Convert those decimal values to 8bits values
                    colorChannels = Object.keys(colorChannels).reduce(function(channels, channelKey) {
                        channels[channelKey] = Math.round(colorChannels[channelKey] * 255);
                        return channels;
                    }, {});

                    // Construct the color object used by the template
                    scope.color = {
                        name: colorToFormats(colorObj, 'exact'),
                        rgb: $.extend(colorChannels, {
                            cssValue: colorToFormats(colorObj, 'rgb')
                        }),
                    };

                    // Construct the model returned to parent scope
                    var formats = angular.isDefined(scope.formats)
                        ? colorToFormats(colorObj)
                        : '#' + args.formatted;

                    // Use a timeout to avoid errors related to the $digest cycle
                    setTimeout(function() {
                        // Return the model to the parent scope
                        scope.$parent.$eval(attrs.ngModel + '=' + JSON.stringify(formats));

                        // Update the template
                        scope.$digest();
                    }, 0);
                });

                // Apply the color inherited from the parent scope
                scope.$parent.$watch(attrs.ngModel, function(formats) {
                    colorpicker.setColor(convertFormatsTo(formats, 'rgb'));
                });
            }

            return {
                template: '\
                    <input type="hidden"> \
                    <button type="button" class="btn color-addon"> \
                        <span class="color-addon-preview" \
                              ng-style="{\'background-color\': color.rgb.cssValue}"> \
                        </span> \
                        <span class="color-addon-description"> \
                            <strong ng-if="color.name">{{ colorPrefix }}{{ color.name }}<br></strong> \
                            R{{ color.rgb.r }} V{{ color.rgb.g }} B{{ color.rgb.b }} \
                        </span> \
                    </button> \
                ',
                require : 'ngModel',
                restrict: 'E',
                link: link,
                scope: {
                    formats: '=',
                    colorPrefix: '=',
                    options: '=',
                }
            };

        })

        .directive('addonRadio', function() {

            function link(scope, element, attrs) {
                scope.radio = {};

                scope.$watch('radio.value', function(value) {
                    if (value) scope.$parent.$eval(attrs.ngModel + '=' + JSON.stringify(value));
                });

                scope.$parent.$watch(attrs.ngModel, function(value) {
                    scope.radio.value = value;
                });
            }

            return {
                template: '\
                    <label ng-repeat="option in options" class="radio"> \
                        <input type="radio" ng-model="radio.value" ng-value="option.key"> \
                        {{ option.name }} \
                    </label> \
                ',
                require : 'ngModel',
                restrict: 'E',
                link: link,
                scope: {
                    options: '=',
                }
            };

        })

        .directive('addonCheckbox', function() {

            function link(scope, element, attrs) {
                scope.checkboxes = {};

                scope.updateModel = function() {
                    var list = Object.keys(scope.checkboxes).reduce(function(list, key) {
                        if (scope.checkboxes[key]) list.push(key);
                        return list;
                    }, []);

                    scope.$parent.$eval(attrs.ngModel + '=' + JSON.stringify(list));
                };

                scope.$parent.$watch(attrs.ngModel, function(values) {
                    if (Array.isArray(values)) {
                        scope.checkboxes = values.reduce(function(checkboxes, value) {
                            checkboxes[value] = true;
                            return checkboxes;
                        }, {});
                    }
                });
            }

            return {
                template: '\
                    <label ng-repeat="option in options" class="checkbox"> \
                        <input type="checkbox" ng-model="checkboxes[option.key]" ng-change="updateModel()"> \
                        {{ option.name }} \
                    </label> \
                ',
                require : 'ngModel',
                restrict: 'E',
                link: link,
                scope: {
                    options: '=',
                }
            };

        });

})();
