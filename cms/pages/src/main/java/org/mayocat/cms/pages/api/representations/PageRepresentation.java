package org.mayocat.cms.pages.api.representations;

import java.util.List;

import org.mayocat.cms.pages.model.Page;
import org.mayocat.rest.representations.ImageRepresentation;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * @version $Id$
 */
public class PageRepresentation
{
    private String slug;

    private String href;

    private String title;

    private String content;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private List<ImageRepresentation> images = null;

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    public PageRepresentation(Page page)
    {
        this.slug = page.getSlug();
        this.href = "/api/1.0/page/" + page.getSlug();
        this.title = page.getTitle();
        this.content = page.getContent();
    }

    public String getSlug()
    {
        return slug;
    }

    public String getTitle()
    {
        return title;
    }

    public String getContent()
    {
        return content;
    }

    public String getHref()
    {
        return href;
    }

    public List<ImageRepresentation> getImages()
    {
        return images;
    }
}