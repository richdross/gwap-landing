module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy({ "public": "/" });

  eleventyConfig.addFilter("readableDate", (date) => {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(date);
  });

  eleventyConfig.addFilter("isoDate", (date) => {
    return new Date(date).toISOString();
  });

  eleventyConfig.addFilter("isoDateOnly", (date) => {
    return new Date(date).toISOString().slice(0, 10);
  });

  eleventyConfig.addFilter("rfc822Date", (date) => {
    return new Date(date).toUTCString();
  });

  eleventyConfig.addFilter("json", (value) => JSON.stringify(value));

  eleventyConfig.addFilter("readingTime", (value) => {
    const text = String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z0-9#]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = text ? text.split(" ").length : 0;
    return Math.max(1, Math.ceil(words / 225));
  });

  eleventyConfig.addFilter("relatedPosts", (collection, currentUrl, max = 3) => {
    return [...(collection || [])]
      .filter((post) => post.url !== currentUrl)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, Number(max) || 3);
  });

  return {
    dir: {
      input: ".",
      includes: "_includes",
      output: "_site",
    },
    templateFormats: ["md", "njk"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
