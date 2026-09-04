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
