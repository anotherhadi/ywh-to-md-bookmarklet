(() => {
  const extract = () => {
    const STRIP = "button, svg, script, style, ywh-icon, ywh-icon-tooltip, ywh-copy-to-clipboard, ywh-share-twitter, ywh-button-export";
    const BLOCK_TAGS = ["article", "aside", "blockquote", "div", "dl", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "ul"];
    const BLOCK_SELECTOR = BLOCK_TAGS.join(",");
    const SEVERITIES = ["Low", "Medium", "High", "Critical"];
    const BR = "\u0000";
    let shift = 0;
  
    const squash = el => el?.textContent.replace(/\s+/g, " ").trim() ?? "";
    const escapeCell = s => s.replace(/\|/g, "\\|");
    const isBlock = el => BLOCK_TAGS.includes(el.localName) || el.querySelector(BLOCK_SELECTOR);
    const isList = s => /^(- |\d+\. )/.test(s);
  
    const wrap = (text, mark) => {
      const [, before, body, after] = text.match(/^(\s*)(.*?)(\s*)$/s);
      return body ? before + mark + body + mark + after : text;
    };
  
    const paragraph = text =>
      text.replace(/[ \t\n]+/g, " ").split(BR).map(l => l.trim()).join("  \n").trim();
  
    const inline = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const content = () => [...node.childNodes].map(inline).join("");
      switch (node.localName) {
        case "strong":
        case "b":
          return wrap(content(), "**");
        case "em":
        case "i":
          return wrap(content(), "_");
        case "code":
          return "`" + node.textContent.trim() + "`";
        case "br":
          return BR;
        case "img":
          return `![${node.alt}](${node.src})`;
        case "a": {
          const text = paragraph(content());
          const href = node.href;
          if (!href || href.startsWith("javascript:")) return text;
          return !text || text === href ? `<${href}>` : `[${text}](${href})`;
        }
        default:
          return content();
      }
    };
  
    const render = (el, tight = false) => {
      const blocks = [];
      let buffer = "";
      const flush = () => {
        const text = paragraph(buffer);
        if (text) blocks.push(text);
        buffer = "";
      };
      for (const child of el.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && isBlock(child)) {
          flush();
          const text = block(child);
          if (text) blocks.push(text);
        } else {
          buffer += inline(child);
        }
      }
      flush();
      return blocks.reduce((acc, b, i) => {
        if (i === 0) return b;
        return acc + (tight || (isList(blocks[i - 1]) && isList(b)) ? "\n" : "\n\n") + b;
      }, "");
    };
  
    const list = el =>
      [...el.children]
        .filter(c => c.localName === "li")
        .map((li, i) => {
          const marker = el.localName === "ol" ? `${i + 1}. ` : "- ";
          const indent = " ".repeat(marker.length);
          return marker + render(li, true).split("\n").map((l, j) => (j && l ? indent + l : l)).join("\n");
        })
        .join("\n");
  
    const table = el => {
      const rows = [...el.rows]
        .map(r => [...r.cells].map(c => escapeCell(paragraph(inline(c)).replace(/\s*\n\s*/g, " "))))
        .filter(r => r.some(Boolean));
      if (!rows.length) return "";
      const width = Math.max(...rows.map(r => r.length));
      const line = r => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
      return [line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n");
    };
  
    const block = el => {
      const tag = el.localName;
      if (/^h[1-6]$/.test(tag)) {
        const text = paragraph(inline(el));
        return text && "#".repeat(Math.min(6, Math.max(3, +tag[1] + shift))) + " " + text;
      }
      switch (tag) {
        case "hr":
          return "---";
        case "pre":
          return "```\n" + el.textContent.replace(/\n+$/, "") + "\n```";
        case "blockquote":
          return render(el).split("\n").map(l => (l ? `> ${l}` : ">")).join("\n");
        case "ul":
        case "ol":
          return list(el);
        case "table":
          return table(el);
        default:
          return render(el);
      }
    };
  
    const md = (el, headingShift = 0, drop = null) => {
      if (!el) return "";
      const clone = el.cloneNode(true);
      clone.querySelectorAll(STRIP).forEach(n => n.remove());
      if (drop) clone.querySelector(drop)?.remove();
      shift = headingShift;
      return render(clone);
    };
  
    const scopes = root => {
      const rows = [...root.querySelectorAll("#program-scopes-table tbody tr:not(.rewards-row)")].map(row => {
        const rewards = {};
        const next = row.nextElementSibling;
        if (next?.classList.contains("rewards-row")) {
          next.querySelectorAll(".flex-column").forEach(b => {
            rewards[squash(b.firstElementChild)] = squash(b.querySelector(".tag-content"));
          });
        }
        return [
          squash(row.querySelector(".mat-column-scope .scope")) || squash(row.querySelector(".mat-column-scope")),
          squash(row.querySelector(".mat-column-type")),
          squash(row.querySelector(".mat-column-assetValue")),
          ...SEVERITIES.map(s => rewards[s] ?? ""),
        ];
      });
  
      const parts = [];
      if (rows.length) {
        const header = ["Scope", "Type", "Asset value", ...SEVERITIES];
        const keep = header.map((_, i) => i === 0 || rows.some(r => r[i]));
        const line = r => `| ${r.filter((_, i) => keep[i]).map(escapeCell).join(" | ")} |`;
        parts.push([header, header.map(() => "---"), ...rows].map(line).join("\n"));
      }
  
      const outOfScope = [...root.querySelectorAll("h3")].find(h => /out of scope/i.test(h.textContent));
      const outOfScopeBody = md(outOfScope?.parentElement, 0, "h3");
      if (outOfScopeBody) parts.push(`### Out of scope\n\n${outOfScopeBody}`);
  
      return parts.join("\n\n");
    };
  
    const root = document.querySelector("#program-description-section");
    if (!root) return null;
  
    const title = squash(document.querySelector(".program-title")) || document.title;
    const summary = squash(document.querySelector("#program-card-information-section p"));
    const head = [`# ${title}`, `<${location.origin}${location.pathname}>`, summary].filter(Boolean).join("\n\n");

    const sections = [
      ["Bug bounty description", md(root.querySelector("#program-rules-paragraph"), 2)],
      ["Rewards", md(root.querySelector("#program-rewards"), 0, "h2")],
      ["Scopes", scopes(root)],
      ["Vulnerability types", md(root.querySelector("#program-vulneraibility-types, #program-vulnerability-types"), 0, "h2")],
      ["Hunting requirements", md(root.querySelector("#hunting-requirements"), 0, "h2")],
      ["Hunters collaboration", md(root.querySelector("#hunters-collaboration"), 0, "h2")],
    ]
      .map(([name, body]) => ({ name, body: body.trim() }))
      .filter(s => s.body);

    return { head, sections };
  };

  const compose = ({ head, sections }, selected) =>
    [head, ...sections.filter(s => selected.has(s.name)).map(s => `## ${s.name}\n\n${s.body}`)].join("\n\n") + "\n";

  // ---- .envrc generator ----
  const ENVRC_ID = "ywh-envrc-overlay";
  const STORAGE_PREFIX = "ywh-envrc:";
  const NON_WEB_HOSTS = new Set([
    "github.com",
    "gitlab.com",
    "bitbucket.org",
    "play.google.com",
    "apps.apple.com",
    "itunes.apple.com",
    "chromewebstore.google.com",
    "addons.mozilla.org",
  ]);
  const USER_PLACEHOLDER =
    /(?:<|\{\{?|\[|#)[^<>{}[\]#]*?(?:user[\s_-]*name|pseudo|nickname|handle)[^<>{}[\]#]*?(?:>|\}\}?|\]|#)/gi;

  const squashText = el => el?.textContent.replace(/\s+/g, " ").trim() ?? "";

  // "www.example.(fr|de)" -> ["www.example.fr", "www.example.de"]
  const expand = s => {
    const m = s.match(/\(([^()]*\|[^()]*)\)/);
    if (!m) return [s];
    return m[1].split("|").flatMap(alt => expand(s.slice(0, m.index) + alt + s.slice(m.index + m[0].length)));
  };

  const toHosts = raw => {
    const token = raw.trim().split(/\s+/)[0] ?? "";
    return expand(token)
      .map(s =>
        s
          .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
          .split(/[/?#]/)[0]
          .replace(/[()\]]+$/, "")
          .replace(/:\d+$/, "")
          .toLowerCase(),
      )
      .filter(s => /^([a-z0-9*-]+\.)+[a-z]{2,}$/.test(s) && !NON_WEB_HOSTS.has(s));
  };

  const username = () =>
    (document.querySelector("#logged-user-menu img[title]")?.title ?? "").replace(/^Signed in as\s*/i, "").trim();

  // "kiteworks-public-bug-bounty-program-1" -> "kiteworks", "bug-bounty-program-blablacar" -> "blablacar"
  const NOISE = /^(public|private|open|bug|bounty|bugbounty|bbp|vdp|program|programme|policy|vulnerability|disclosure|\d+)$/;
  const defaultProgram = slug => {
    const words = slug.toLowerCase().split("-");
    while (words.length > 1 && NOISE.test(words.at(-1))) words.pop();
    while (words.length > 1 && /^(bug|bounty|bugbounty|program|programme)$/.test(words[0])) words.shift();
    return words.join("-");
  };

  const scopeHosts = () => {
    const hosts = [...document.querySelectorAll("#program-scopes-table tbody tr:not(.rewards-row)")]
      .map(row => squashText(row.querySelector(".mat-column-scope .scope")) || squashText(row.querySelector(".mat-column-scope")))
      .flatMap(toHosts);
    return [...new Set(hosts)];
  };

  const rateLimit = text => {
    const patterns = [
      /(\d+)\s*(?:requests?|requêtes?|req|rq)s?\s*(?:\/|per|par)\s*(?:seconde?|sec|s)\b/i,
      /(\d+)\s*(?:rps|req\/s)\b/i,
      /(?:rate[\s-]*limit\w*|max(?:imum)?)\D{0,30}?(\d+)\s*(?:\/\s*s\b|per\s+second)/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) return m[1];
    }
    return null;
  };

  const requiredUserAgent = user => {
    const heading = [...document.querySelectorAll("#hunting-requirements h3")].find(h => /user[\s-]*agent/i.test(h.textContent));
    const block = heading?.parentElement;
    if (!block) return null;
    let value = squashText(block.querySelector("strong, b, code"));
    if (!value) {
      const m = squashText(block).match(/['"‘’“”]\s*([^'"‘’“”]+?)\s*['"‘’“”]/);
      value = m?.[1] ?? "";
    }
    if (!value) return null;
    return user ? value.replace(USER_PLACEHOLDER, user) : value;
  };

  const detectEnvrc = slug => {
    const user = username();
    const program = defaultProgram(slug);
    const text = squashText(document.querySelector("#program-description-section"));
    const rate = rateLimit(text);
    const ua = requiredUserAgent(user);
    return {
      values: {
        program,
        scope: scopeHosts().join(","),
        ratelimit: rate ?? "",
        useragent: ua ? `-${ua.replace(/^-+/, "")}` : "",
      },
    };
  };

  const shellEscape = s => s.replace(/[\\"$`]/g, "\\$&");

  const renderEnvrc = v => {
    const q = k => `"${shellEscape(v[k])}"`;
    return `export program=${q("program")}
export scope=${q("scope")}
export ratelimit=${q("ratelimit")}
export useragent=${q("useragent")}
`;
  };

  const showEnvrc = slug => {
    const key = STORAGE_PREFIX + slug;
    const detected = detectEnvrc(slug);
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(key)) ?? {};
    } catch {}
    const values = { ...detected.values, ...saved };
    let output = "";

    const overlay = document.createElement("div");
    overlay.id = ENVRC_ID;
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center";

    const panel = document.createElement("div");
    panel.style.cssText = "width:min(900px,90vw);max-height:85vh;display:flex;flex-direction:column;background:#1b1d23;color:#e6e6e6;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5);font:13px system-ui,sans-serif";

    const makeButton = (label, onClick, color = "#e60000") => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText = `padding:5px 12px;border:0;border-radius:6px;background:${color};color:#fff;cursor:pointer`;
      button.addEventListener("click", () => onClick(button));
      return button;
    };

    const header = document.createElement("div");
    header.style.cssText = "display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid #333";
    const title = document.createElement("strong");
    title.textContent = ".envrc export";
    title.style.marginRight = "auto";

    const form = document.createElement("div");
    form.style.cssText = "display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;padding:12px 14px;border-bottom:1px solid #333";

    const inputs = {};
    for (const name of ["program", "scope", "ratelimit", "useragent"]) {
      const label = document.createElement("label");
      label.textContent = name;
      label.style.cssText = "font-family:ui-monospace,monospace;color:#aaa";
      const field = document.createElement(name === "scope" ? "textarea" : "input");
      field.value = values[name];
      field.spellcheck = false;
      field.style.cssText = "width:100%;box-sizing:border-box;padding:5px 8px;background:#262932;color:inherit;border:1px solid #3a3d47;border-radius:6px;font:12px ui-monospace,monospace;resize:vertical";
      if (name === "scope") field.rows = 3;
      field.addEventListener("input", () => {
        values[name] = name === "scope" ? field.value.replace(/[\s,]+/g, ",").replace(/^,|,$/g, "") : field.value.trim();
        localStorage.setItem(key, JSON.stringify(values));
        update();
      });
      inputs[name] = field;
      form.append(label, field);
    }

    const hint = document.createElement("div");
    hint.style.cssText = "grid-column:2;color:#888;font-size:11px";
    const setHint = withSaved => {
      hint.textContent = withSaved ? "showing saved edits" : "";
      hint.style.display = hint.textContent ? "" : "none";
    };
    setHint(Object.keys(saved).length > 0);
    form.append(hint);

    const pre = document.createElement("pre");
    pre.style.cssText = "flex:1;margin:0;padding:14px;overflow:auto;white-space:pre-wrap;word-break:break-all;font:12px ui-monospace,monospace;color:inherit;background:none;border:0";

    function update() {
      output = renderEnvrc(values);
      pre.textContent = output;
    }

    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
    };
    const onKey = e => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };

    const copy = makeButton("Copy", async button => {
      await navigator.clipboard.writeText(output);
      button.textContent = "Copied!";
      setTimeout(() => (button.textContent = "Copy"), 1500);
    });
    const download = makeButton("Download", () => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([output], { type: "text/plain" }));
      link.download = `envrc-${values.program.replace(/[^\w.-]+/g, "-") || slug}.txt`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    const reset = makeButton(
      "Reset",
      () => {
        localStorage.removeItem(key);
        Object.assign(values, detected.values);
        for (const [name, field] of Object.entries(inputs)) field.value = values[name];
        setHint(false);
        update();
      },
      "#444",
    );
    const closeButton = makeButton("Close", close, "#444");

    update();
    header.append(title, reset, copy, download, closeButton);
    panel.append(header, form, pre);
    overlay.append(panel);
    overlay.addEventListener("click", e => e.target === overlay && close());
    document.addEventListener("keydown", onKey, true);
    document.body.append(overlay);
  };

  // ---- Markdown export ----
  const STORAGE_KEY = "ywh-md-hidden-sections";

  const loadHidden = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []);
    } catch {
      return new Set();
    }
  };

  const showModal = program => {
    document.getElementById("ywh-md-overlay")?.remove();
    const slug = location.pathname.split("/").filter(Boolean).pop() ?? "program";
    const hidden = loadHidden();
    const selected = new Set(program.sections.map(s => s.name).filter(n => !hidden.has(n)));
    let markdown = "";

    const overlay = document.createElement("div");
    overlay.id = "ywh-md-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center";

    const panel = document.createElement("div");
    panel.style.cssText = "width:min(900px,90vw);height:80vh;display:flex;flex-direction:column;background:#1b1d23;color:#e6e6e6;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5);font:13px system-ui,sans-serif";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid #333";
    const title = document.createElement("strong");
    title.textContent = "Markdown export";
    title.style.marginRight = "auto";

    const makeButton = (label, onClick) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText = "padding:5px 12px;border:0;border-radius:6px;background:#e60000;color:#fff;cursor:pointer";
      button.addEventListener("click", e => onClick(button, e));
      return button;
    };

    const pre = document.createElement("pre");
    pre.style.cssText = "flex:1;margin:0;padding:14px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px ui-monospace,monospace;color:inherit;background:none;border:0";

    const dropdown = document.createElement("div");
    dropdown.style.position = "relative";
    const menu = document.createElement("div");
    menu.style.cssText = "display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:1;min-width:230px;padding:6px;background:#262932;border:1px solid #3a3d47;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.4)";
    const toggle = makeButton("", (_, e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    });
    toggle.style.background = "#444";

    const checkboxes = program.sections.map(({ name }) => {
      const label = document.createElement("label");
      label.style.cssText = "display:flex;gap:8px;align-items:center;padding:5px 6px;border-radius:4px;cursor:pointer;white-space:nowrap";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = selected.has(name);
      box.addEventListener("change", () => {
        box.checked ? selected.add(name) : selected.delete(name);
        update();
      });
      label.append(box, name);
      menu.append(label);
      return [name, box];
    });

    const setAll = checked => {
      for (const [name, box] of checkboxes) {
        box.checked = checked;
        checked ? selected.add(name) : selected.delete(name);
      }
      update();
    };
    const shortcuts = document.createElement("div");
    shortcuts.style.cssText = "display:flex;gap:6px;padding:6px 6px 2px;border-top:1px solid #3a3d47;margin-top:4px";
    const all = makeButton("All", () => setAll(true));
    const none = makeButton("None", () => setAll(false));
    for (const b of [all, none]) b.style.cssText += ";flex:1;padding:3px 8px;background:#444";
    shortcuts.append(all, none);
    menu.append(shortcuts);
    menu.addEventListener("click", e => e.stopPropagation());
    dropdown.append(toggle, menu);

    function update() {
      markdown = compose(program, selected);
      pre.textContent = markdown;
      toggle.textContent = `Sections (${selected.size}/${program.sections.length}) ▾`;
      for (const { name } of program.sections) selected.has(name) ? hidden.delete(name) : hidden.add(name);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
    }

    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = e => {
      if (e.key !== "Escape") return;
      if (menu.style.display !== "none") menu.style.display = "none";
      else close();
    };

    const copy = makeButton("Copy", async button => {
      await navigator.clipboard.writeText(markdown);
      button.textContent = "Copied!";
      setTimeout(() => (button.textContent = "Copy"), 1500);
    });
    const download = makeButton("Download .md", () => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
      link.download = `${slug}.md`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    const closeButton = makeButton("Close", close);
    closeButton.style.background = "#444";

    const envrcButton = makeButton(".envrc", () => showEnvrc(slug));
    envrcButton.title = "Generate .envrc for this program";
    envrcButton.style.cssText += ";position:fixed;right:24px;bottom:24px;padding:10px 16px;border-radius:999px;font:600 13px ui-monospace,monospace;box-shadow:0 4px 14px rgba(0,0,0,.5)";
    overlay.append(envrcButton);

    update();
    header.append(title, dropdown, copy, download, closeButton);
    panel.append(header, pre);
    panel.addEventListener("click", () => (menu.style.display = "none"));
    overlay.append(panel);
    overlay.addEventListener("click", e => e.target === overlay && close());
    document.addEventListener("keydown", onKey);
    document.body.append(overlay);
  };

  const existing = document.getElementById("ywh-md-overlay");
  if (existing) {
    document.getElementById(ENVRC_ID)?.remove();
    return existing.remove();
  }
  if (!/^https:\/\/yeswehack\.com\/programs\/[^/]+\/?$/.test(location.origin + location.pathname)) {
    return alert("Open a YesWeHack program page first.");
  }
  const program = extract();
  if (!program) return alert("No program description found on this page.");
  showModal(program);
})();
