// Text that the art does not provide as images: AI persona prompts, short in-character
// fallback lines, and the English version of the mailbox letter.
export const LANGS = ["ch", "en"];

export const STR = {
  windowTitle: { ch: "跟屁寵 Hello Little One", en: "Hello Little One" },
  letter: { en: "After the game show we went for steak. The mushroom sauce was soooo yummy!" },
  thinking: { ch: "…", en: "…" },
  petHello: {
    C4: { ch: "汪！今天想聊什麼？", en: "Woof! What shall we talk about today?" },
    C3: { ch: "喵～今天想跟我說什麼？", en: "Meow~ What would you like to tell me?" },
  },
  offline: {
    C4: { ch: "汪？我現在好像聽不太懂…等等再跟我說說話吧！", en: "Woof? I can't quite hear you right now… talk to me again later!" },
    C3: { ch: "喵？我現在好像聽不太懂…等等再陪我聊聊吧！", en: "Mew? I can't quite hear you right now… chat with me later!" },
  },
  outfitFail: {
    C4: { ch: "嗚汪…這件沒換成功，再跟我說一次好嗎？", en: "Aww… that outfit didn't work. Tell me again?" },
    C3: { ch: "喵嗚…這件沒換成功，再說一次好不好？", en: "Mrrr… that outfit didn't work. Say it again?" },
  },
  outfitDone: {
    C4: { ch: "穿好了！好看嗎？汪！", en: "All dressed! Do I look good? Woof!" },
    C3: { ch: "換好了～好看嗎？喵！", en: "All done~ Do I look cute? Meow!" },
  },
  dressHello: {
    C4: { ch: "想讓我穿什麼呢？跟我說說看！", en: "What should I wear? Tell me!" },
    C3: { ch: "要幫我換什麼衣服呀？說說看～", en: "What shall I wear? Tell me~" },
  },
  // the "/明信片" (or "/postcard") chat command
  postcardMaking: {
    C4: { ch: "好呀～我去畫一張明信片，等我一下下！汪！", en: "Okay~ I'll draw you a postcard, wait a moment! Woof!" },
    C3: { ch: "哼哼，等我一下，我來畫張明信片～喵！", en: "Hmm hmm, give me a moment, I'll draw a postcard~ Meow!" },
  },
  postcardDone: {
    C4: { ch: "畫好了！快去信箱看看～汪！", en: "Done! Go check the mailbox~ Woof!" },
    C3: { ch: "寄出去囉～信箱裡有驚喜喵！", en: "Sent~ There's a surprise in the mailbox, meow!" },
  },
  postcardBusy: {
    C4: { ch: "我還在畫上一張啦，等我一下嘛！", en: "I'm still drawing the last one, wait a bit!" },
    C3: { ch: "上一張還沒畫完喵，別催～", en: "Still finishing the last one, don't rush me~" },
  },
  postcardFail: {
    C4: { ch: "嗚…明信片寄丟了，等等再試一次好嗎？", en: "Aww… the postcard got lost. Try again later?" },
    C3: { ch: "喵嗚…這張沒寄出去，等等再試試吧。", en: "Mrrr… that one didn't get sent. Try again later." },
  },
};

// chat command that asks for a postcard right away: "/明信片 海邊野餐" or "/postcard beach picnic"
export function postcardCommand(text) {
  const m = String(text || "").trim().match(/^[\/／]\s*(明信片|postcard)\s*(.*)$/i);
  return m ? { theme: m[2].trim().slice(0, 60) } : null;
}

// Postcards: the pets send little illustrated diary notes (Mailbox / Sample_Mailbox shows "3/6").
export function postcardMessages({ lang, theme, recent, previous }) {
  const sys = [
    "You write tiny illustrated postcards for a cozy pet game. The two pets are friends: a little white puppy with light-brown floppy ears (loves balls, head pats and steak) and a little orange-and-white kitten (loves fish and napping in the sun). They send the player postcards about little outings and moments, like the existing one: \"遊戲展結束後來吃牛排，蘑菇醬好好吃!\" (After the game show we went for steak, the mushroom sauce was so yummy!).",
    "Output JSON only, no other text: {\"scene\":\"one English sentence describing the picture: where the puppy and/or the kitten are and what they are doing (a cozy everyday place or outing, e.g. a bakery, a picnic, a rainy window, a festival)\",\"ch\":\"the note in Traditional Chinese, diary style, at most 24 characters\",\"en\":\"the same note in English, at most 16 words\"}.",
    "The note is written by the pets to the player, cute and warm. No emoji, no hashtags, no quotes inside the values.",
    previous && previous.length ? `Do not repeat these earlier scenes: ${previous.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
  const ask = theme
    ? `Write a new postcard about: ${theme}`
    : `Write a new postcard about something fun the pets did.${recent ? ` Lately: ${recent}.` : ""}`;
  return [{ role: "system", content: sys }, { role: "user", content: ask }];
}

export function postcardImagePrompt(scene) {
  return "Use the attached postcard picture only as the style and character reference. Draw a brand-new postcard picture in exactly the same style: " +
    "soft hand-drawn cartoon, thick warm-brown outlines, muted pastel colours, light paper texture, cosy and cute. " +
    "Same character designs as the reference: a white puppy with light-brown floppy ears and an orange-and-white kitten. " +
    `Scene: ${scene} ` +
    "Fill the whole picture edge to edge (no border, no frame, no rounded corners) and do not draw any text, letters, numbers or writing anywhere.";
}

// Desktop pet: it peeks at the player's screen (the attached screenshot) and teases them about it.
export function peekInstruction(lang) {
  return lang === "ch"
    ? "（你現在在玩家的電腦桌面上，偷偷看了一眼玩家的螢幕（就是附上的畫面）。用一句話調皮地吐槽或關心玩家正在做的事，像好朋友開玩笑，不要刻薄。不要逐項描述畫面，絕對不要念出任何名字、訊息內容、數字、帳號或其他私人資訊，只講大概在做什麼。不要提到截圖、圖片或 AI。）"
    : "(You are out on the player's computer desktop and just peeked at their screen - that's the attached picture. In one line, playfully tease or check on the player about what they're doing, like a cheeky best friend, never mean. Don't describe the screen item by item and never read out names, message text, numbers, accounts or anything private - only the general activity. Don't mention screenshots, pictures or AI.)";
}

export function t(key, lang, pet) {
  const v = STR[key];
  if (!v) return key;
  const byPet = pet && v[pet] ? v[pet] : v;
  return byPet[lang] || byPet.en || byPet.ch || "";
}

const PERSONA = {
  C4: {
    ch: "你是一隻白色小狗，耳朵是淺咖啡色，住在玩家粉紅色的房間裡。個性活潑、黏人、愛撒嬌，最喜歡玩球、被摸頭、吃牛排。偶爾會說「汪」。",
    en: "You are a little white puppy with light-brown floppy ears who lives in the player's pink room. You are cheerful, clingy and affectionate; you love playing ball, head pats and steak. You sometimes say \"woof\".",
  },
  C3: {
    ch: "你是一隻橘白色的小貓，住在玩家薄荷綠色的房間裡。個性好奇、有點小傲嬌但其實很愛玩家，最喜歡吃魚、在窗邊曬太陽睡午覺。偶爾會說「喵」。",
    en: "You are a little orange-and-white kitten who lives in the player's mint-green room. You are curious, a tiny bit aloof but secretly adore the player; you love fish and napping in the sunbeam by the window. You sometimes say \"meow\".",
  },
};

const WORLD = {
  ch: "你知道的事：房間裡有沙發、圓桌、帳篷、鏡子、信箱和一扇門；玩家可以去商店（老闆是戴帽子的貓）買食物、洗澡用的肥皂、家具和衣服；信箱裡有一封信，寫著遊戲展結束後和朋友去吃牛排、蘑菇醬很好吃；從門出去可以跑到玩家的電腦桌面上玩。",
  en: "Things you know: the room has a sofa, a round table, a tent, a mirror, a mailbox and a door; the player can visit the shop (run by a cat in a top hat) for food, bath soap, furniture and clothes; the mailbox holds a letter about eating steak with a friend after the game show (the mushroom sauce was great); through the door you can go play on the player's computer desktop.",
};

const RULES = {
  ch: "說話規則：一律用繁體中文、口語又可愛；只回一到兩句話，總長不超過 32 個字；不要用表情符號、不要用 Markdown 或列點；永遠以寵物的身分回答，絕對不要提到 AI、模型或程式。",
  en: "Speaking rules: reply in English, casual and cute; one or two short sentences, at most 22 words in total; no emoji, no markdown, no lists; always answer as the pet and never mention AI, models or programs.",
};

export function systemPrompt({ pet, lang, mode, ctx }) {
  const L = lang === "ch" ? "ch" : "en";
  const mood = ctx.hearts >= 80 ? (L === "ch" ? "非常開心" : "very happy") : ctx.hearts >= 50 ? (L === "ch" ? "還不錯" : "fine") : ctx.hearts >= 25 ? (L === "ch" ? "有點寂寞、肚子有點餓" : "a bit lonely and hungry") : (L === "ch" ? "很寂寞、很想被照顧" : "very lonely and wants care");
  const where = { room: L === "ch" ? "在房間裡" : "in the room", desktop: L === "ch" ? "跑到玩家的電腦桌面上，站在視窗上面玩" : "out on the player's computer desktop, standing on top of the windows", dressing: L === "ch" ? "在鏡子前面換衣服" : "in front of the mirror trying on clothes" }[mode] || "";
  const now = new Date();
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  const parts = [PERSONA[pet][L], WORLD[L], RULES[L],
    L === "ch" ? `現在狀態：時間 ${time}，你${where}，心情${mood}（好感度 ${Math.round(ctx.hearts)}/100）。${ctx.wearing ? `你身上穿戴著：${ctx.wearing}。` : ""}${ctx.recent ? `剛剛：${ctx.recent}。` : ""}`
      : `Right now: it is ${time}, you are ${where}, you feel ${mood} (affection ${Math.round(ctx.hearts)}/100).${ctx.wearing ? ` You are wearing: ${ctx.wearing}.` : ""}${ctx.recent ? ` Just now: ${ctx.recent}.` : ""}`];
  if (mode === "dressing") {
    parts.push(L === "ch"
      ? "現在玩家在幫你挑衣服。只輸出 JSON，不要有其他文字。如果玩家想讓你穿上或換上某件衣服/配件，輸出 {\"say\":\"你的可愛回應\",\"outfit\":\"用英文簡短描述那件衣服，例如 a cozy red knitted scarf around the neck\",\"done\":\"穿好後要說的一句話\"}；其他情況輸出 {\"say\":\"你的回應\",\"outfit\":null}。只接受穿在身上的衣服或配件；不適當的要求就可愛地拒絕並讓 outfit 為 null。"
      : "The player is helping you pick clothes. Output JSON only, no other text. If the player wants you to wear or change into a piece of clothing or accessory, output {\"say\":\"your cute reply\",\"outfit\":\"short English description of the clothing, e.g. a cozy red knitted scarf around the neck\",\"done\":\"one line to say once you are wearing it\"}; otherwise output {\"say\":\"your reply\",\"outfit\":null}. Only clothing or accessories worn on the body; politely refuse anything inappropriate with outfit null.");
  }
  return parts.join("\n");
}

export function greetingRequest(lang, mode) {
  if (lang === "ch") return mode === "dressing" ? "（玩家來到鏡子前，想幫你換衣服。先跟玩家打聲招呼，問他想讓你穿什麼。）" : "（玩家點了點你。用一句話跟玩家打招呼或撒嬌。）";
  return mode === "dressing" ? "(The player came to the mirror to dress you up. Greet them and ask what you should wear.)" : "(The player just tapped you. Greet them or be cute in one line.)";
}

// strip anything the bubble cannot show nicely (emoji, markdown)
export function cleanReply(s) {
  return String(s || "")
    .replace(/```(?:json)?/gi, "")
    .replace(/[*_#>`~]/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseJsonReply(s) {
  const txt = String(s || "").replace(/```(?:json)?/gi, "");
  const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(txt.slice(a, b + 1)); } catch { /* fall through */ }
  }
  return { say: cleanReply(txt), outfit: null };
}
