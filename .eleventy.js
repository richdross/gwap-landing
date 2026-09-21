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

  eleventyConfig.addFilter("xmlEscape", (value = "") => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;"));

  eleventyConfig.addFilter("absoluteUrl", (value, base = "https://gwapgang.com") => {
    if (!value) return base;
    try {
      return new URL(value, base).href;
    } catch {
      return value;
    }
  });

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

  const toList = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
    if (value === undefined || value === null || value === "") return [];
    return String(value).split(",").map((item) => item.trim()).filter(Boolean);
  };

  const normalize = (value) => String(value || "").trim().toLowerCase();
  const slugFromRef = (value) => {
    if (!value) return "";
    const raw = String(value).split("#")[0].split("?")[0].replace(/\\/g, "/").replace(/\/$/, "");
    const last = raw.split("/").filter(Boolean).pop() || "";
    return last.replace(/\.md$/i, "").replace(/index\.html$/i, "");
  };
  const postSlug = (post) => post && (post.fileSlug || slugFromRef(post.url));
  const overlap = (left, right) => {
    const a = new Set(toList(left).map(normalize));
    const b = new Set(toList(right).map(normalize));
    return [...a].filter((v) => b.has(v));
  };
  const relationship = (candidate, current) => {
    const data = candidate && candidate.data ? candidate.data : {};
    let score = 0;
    const reasons = [];
    if (normalize(data.section) && normalize(data.section) === normalize(current.section)) { score += 2; reasons.push("same section"); }
    if (normalize(data.category) && normalize(data.category) === normalize(current.category)) { score += 3; reasons.push("same category"); }
    [["topics",4],["entities",2],["technologies",4],["businessModels",3]].forEach(([key,weight]) => {
      const shared = overlap(current[key], data[key]);
      if (shared.length) { score += shared.length * weight; reasons.push(key + ": " + shared.join(", ")); }
    });
    const manual = new Set(toList(current.relatedArticles).map(slugFromRef));
    if (manual.has(postSlug(candidate))) { score += 14; reasons.unshift("editorial relationship"); }
    return { score, reasons };
  };
  const rankRelated = (posts, currentUrl, current, excludeRef = "") => {
    if (!Array.isArray(posts)) return [];
    const excluded = slugFromRef(excludeRef);
    return posts
      .filter((post) => post && post.url && post.url !== currentUrl && (!excluded || postSlug(post) !== excluded))
      .map((post) => ({ post, ...relationship(post, current) }))
      .filter((item) => item.score > 0)
      .sort((a,b) => b.score !== a.score ? b.score-a.score : new Date(b.post.date||0)-new Date(a.post.date||0));
  };

  eleventyConfig.addFilter("sectionName", (value) => {
    const k = normalize(value);
    if (k === "culture") return "Culture";
    if (k === "capital") return "Capital";
    if (k === "technology") return "Technology";
    return "Intelligence";
  });

  eleventyConfig.addFilter("graphKeywords", (section, category, topics, entities, technologies, businessModels) => {
    const seen=new Set();
    return [section,category,...toList(topics),...toList(entities),...toList(technologies),...toList(businessModels)]
      .filter((v)=>{const k=normalize(v); if(!k||seen.has(k)) return false; seen.add(k); return true;});
  });

  eleventyConfig.addFilter("graphAbout", (entities, technologies) => {
    const seen=new Set();
    return [...toList(entities),...toList(technologies)]
      .filter((v)=>{const k=normalize(v); if(!k||seen.has(k)) return false; seen.add(k); return true;})
      .map((name)=>({"@type":"Thing",name}));
  });

  eleventyConfig.addFilter("graphRelated", (posts,currentUrl,section,category,topics,entities,technologies,businessModels,relatedArticles,nextMove,count=3) => {
    return rankRelated(posts,currentUrl,{section,category,topics,entities,technologies,businessModels,relatedArticles},nextMove)
      .slice(0,Math.max(0,Number(count)||3)).map((x)=>x.post);
  });

  eleventyConfig.addFilter("graphNextMove", (posts,currentUrl,nextMove,section,category,topics,entities,technologies,businessModels,relatedArticles) => {
    if (!Array.isArray(posts)) return null;
    const slug=slugFromRef(nextMove);
    if (slug) {
      const hit=posts.find((post)=>post && post.url!==currentUrl && postSlug(post)===slug);
      if (hit) return hit;
    }
    const ranked=rankRelated(posts,currentUrl,{section,category,topics,entities,technologies,businessModels,relatedArticles});
    return ranked.length ? ranked[0].post : null;
  });

  const opportunityScore = (opportunity, current) => {
    if (!opportunity || !opportunity.id) return { score: 0, reasons: [] };
    let score = 0; const reasons = [];
    const explicit = new Set(toList(current.commercialOpportunities).map(normalize));
    if (explicit.has(normalize(opportunity.id))) { score += 30; reasons.push("editorial commercial relationship"); }
    if (toList(opportunity.sections).map(normalize).includes(normalize(current.section))) { score += 3; reasons.push("section fit"); }
    [["topics",4],["entities",2],["technologies",4],["businessModels",3]].forEach(([key,weight])=>{
      const shared=overlap(current[key],opportunity[key]); if(shared.length){score+=shared.length*weight;reasons.push(key+": "+shared.join(", "));}
    });
    return { score, reasons };
  };

  const rankOpportunities = (catalog, current) => {
    if (!Array.isArray(catalog)) return [];
    return catalog.map((opportunity)=>({ ...opportunity, ...opportunityScore(opportunity,current) }))
      .filter((opportunity)=>opportunity.score >= Math.max(1,Number(opportunity.minScore)||1))
      .sort((a,b)=>b.score-a.score || String(a.name).localeCompare(String(b.name)));
  };

  eleventyConfig.addFilter("opportunityMatches", (commercialOpportunities,catalog,section,category,topics,entities,technologies,businessModels,count=3) => {
    return rankOpportunities(catalog,{commercialOpportunities,section,category,topics,entities,technologies,businessModels})
      .slice(0,Math.max(0,Number(count)||3));
  });

  eleventyConfig.addFilter("intelligenceGraph", (posts, opportunityCatalog = []) => {
    const list=Array.isArray(posts)?posts.filter((p)=>p&&p.url):[];
    const catalog=Array.isArray(opportunityCatalog)?opportunityCatalog.filter((o)=>o&&o.id):[];
    const articleNodes=list.map((post)=>({
      id:postSlug(post),type:"article",url:post.url,title:post.data.title,section:post.data.section||"intelligence",
      category:post.data.category||"Gwap Intelligence",topics:toList(post.data.topics),entities:toList(post.data.entities),
      technologies:toList(post.data.technologies),businessModels:toList(post.data.businessModels),
      commercialOpportunities:toList(post.data.commercialOpportunities)
    }));
    const edges=[],seen=new Set(),opportunityArticles=new Map(catalog.map((o)=>[o.id,[]]));
    const add=(source,target,type,weight,reasons=[])=>{if(!source||!target||source===target)return;const k=source+"|"+target+"|"+type;if(seen.has(k))return;seen.add(k);edges.push({source,target,type,weight,reasons});};
    list.forEach((post)=>{
      const d=post.data||{},source=postSlug(post),current={section:d.section,category:d.category,topics:d.topics,entities:d.entities,technologies:d.technologies,businessModels:d.businessModels,relatedArticles:d.relatedArticles,commercialOpportunities:d.commercialOpportunities};
      const next=slugFromRef(d.nextMove); if(next)add(source,next,"next_move",100,["editorial next move"]);
      toList(d.relatedArticles).forEach((ref)=>add(source,slugFromRef(ref),"editorial_relation",25,["manual editorial relationship"]));
      rankRelated(list,post.url,current,d.nextMove).slice(0,3).forEach((x)=>add(source,postSlug(x.post),"signal_relation",x.score,x.reasons));
      rankOpportunities(catalog,current).slice(0,3).forEach((o)=>{const target="opportunity:"+o.id;add(source,target,"opportunity_relation",o.score,o.reasons);const a=opportunityArticles.get(o.id);if(a&&!a.includes(source))a.push(source);});
    });
    const opportunityNodes=catalog.map((o)=>({id:"opportunity:"+o.id,opportunityId:o.id,type:"opportunity",name:o.name,kind:o.kind,status:o.status,price:o.price||"",url:o.url||"",cta:o.cta||"",description:o.description||"",sections:toList(o.sections),topics:toList(o.topics),entities:toList(o.entities),technologies:toList(o.technologies),businessModels:toList(o.businessModels),articles:opportunityArticles.get(o.id)||[]}));
    const nodes=[...articleNodes,...opportunityNodes];
    return {version:"2.0",generatedBy:"Gwap Intelligence Graph",nodeCount:nodes.length,articleCount:articleNodes.length,opportunityCount:opportunityNodes.length,edgeCount:edges.length,nodes,edges};
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
