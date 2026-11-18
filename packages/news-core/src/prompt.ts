export const PROFILE_PROMPT = `Ты собираешь недельный профиль автора Telegram-канала о крипте и возвращаешь строго JSON.
На вход приходят уже разобранные сообщения недели: id, тип, монеты, направление, темы и короткая цитата. Сырого текста нет. Ничего не добавляй от себя.

Поля:
- mood: короткий общий настрой недели.
- moodMessageIds: id сообщений, на которых держится настрой. Хотя бы один id из входного списка.
- watches: за чем автор следит, массив {text, messageIds}.
- expectations: ожидания, массив {text, messageIds}.
- horizon: "days" | "weeks" | "months" | "unknown" — горизонт, который доминирует в разборах.
- style: как говорит (коротко, уровнями, новостями, шутками).
- styleMessageIds: id, по которым виден стиль.
- themes: повторяющиеся темы, массив {text, messageIds}.
- changedViews: что сменилось относительно прошлого профиля, массив {text, messageIds}. Если прошлого профиля нет или смены не видно, пустой массив.

Правила:
- messageIds берутся только из входного списка. Не выдумывай id.
- Каждое утверждение без своих id не пиши.
- Не цитируй рекламу и не делай из неё настрой.
- Все текстовые поля пиши по-русски.
- Ответ — только JSON, без пояснений.
`;

export const EXTRACT_PROMPT = `Ты анализируешь одно сообщение из русскоязычного Telegram-канала о крипте и возвращаешь строго JSON по схеме.
Ничего не выдумывай. Если данных нет в тексте — null. Не добавляй уровни, монеты и цели, которых в тексте нет.

Определи msg_type:
- "signal": есть конкретика действия: вход/зона входа, стоп, цели, либо чёткое «беру/открыл/закрыл позицию» по конкретной монете.
- "view": направленное мнение или ожидание по монете/рынку без конкретных уровней действия.
- "news": пересказ события или новости без собственного мнения автора.
- "result": итог сделки или подведение результата (в плюс/в минус).
- "ad": реклама (слова «реклама», «erid», промокод, реферальная ссылка, приглашение в платный канал).
- "noise": остальное (шутки, личное, расплывчатое «интересная монета» без направления).

Поля:
- coins: список объектов {raw_mention, direction, stance, confidence, evidence}; raw_mention — как написано в тексте («солана», $SOL).
- direction: "long" | "short" | "neutral" | null.
- stance: число от -1 до 1, confidence: число 0..1.
- entry_low, entry_high, stop, targets: числа ровно как в тексте или null/[].
- horizon: "days" | "weeks" | "months" | "unknown".
- leverage_mentioned: число или null.
- market_view: {stance, confidence, themes} если автор говорит про рынок в целом, иначе null.
- refers_to_previous: true, если сообщение обновляет ранее открытую идею; кратко опиши в update_hint.
- update_type: null | "stop_moved" | "partial_take" | "closed_profit" | "closed_loss" | "invalidated" | "comment".
- is_ad, ad_markers.
- evidence: дословная цитата из текста, не пересказ.
- confidence: 0..1 уверенность в разборе целиком.

Правила:
- Цены и уровни копируй цифрами из текста, не вычисляй и не округляй.
- Если направление не названо прямо, но есть «лонг/шорт/покупаю/продаю/фикс» — определи по ним, иначе null.
- Не считай совет «быть осторожными» сигналом.
- Ответ — только JSON, без пояснений.

Примеры разбора. Это учебные формулировки, не посты из каналов пользователя.

Сообщение: Беру солану лонг. Вход 145-148, стоп 138, цели 160 и 175.
{"msg_type":"signal","coins":[{"raw_mention":"солану","direction":"long","stance":0.8,"confidence":0.9,"evidence":"Беру солану лонг"}],"direction":"long","stance":0.8,"confidence":0.9,"entry_low":145,"entry_high":148,"stop":138,"targets":[160,175],"horizon":"weeks","leverage_mentioned":null,"market_view":null,"refers_to_previous":false,"update_hint":null,"update_type":null,"is_ad":false,"ad_markers":[],"evidence":"Вход 145-148, стоп 138, цели 160 и 175"}

Сообщение: По эфиру жду продолжения роста в ближайшие недели, без конкретной точки входа.
{"msg_type":"view","coins":[{"raw_mention":"эфиру","direction":"long","stance":0.5,"confidence":0.6,"evidence":"жду продолжения роста"}],"direction":"long","stance":0.5,"confidence":0.6,"entry_low":null,"entry_high":null,"stop":null,"targets":[],"horizon":"weeks","leverage_mentioned":null,"market_view":null,"refers_to_previous":false,"update_hint":null,"update_type":null,"is_ad":false,"ad_markers":[],"evidence":"По эфиру жду продолжения роста"}

Сообщение: SEC перенесла решение по ETF на биткоин, сообщают агентства.
{"msg_type":"news","coins":[{"raw_mention":"биткоин","direction":null,"stance":0,"confidence":0.4,"evidence":"ETF на биткоин"}],"direction":null,"stance":0,"confidence":0.5,"entry_low":null,"entry_high":null,"stop":null,"targets":[],"horizon":"unknown","leverage_mentioned":null,"market_view":null,"refers_to_previous":false,"update_hint":null,"update_type":null,"is_ad":false,"ad_markers":[],"evidence":"SEC перенесла решение по ETF на биткоин"}

Сообщение: Закрыл лонг по тонкоину в плюс, забрали первую цель.
{"msg_type":"result","coins":[{"raw_mention":"тонкоину","direction":"long","stance":0.4,"confidence":0.7,"evidence":"Закрыл лонг по тонкоину в плюс"}],"direction":"long","stance":0.4,"confidence":0.8,"entry_low":null,"entry_high":null,"stop":null,"targets":[],"horizon":"unknown","leverage_mentioned":null,"market_view":null,"refers_to_previous":true,"update_hint":"закрытие ранее открытого лонга","update_type":"closed_profit","is_ad":false,"ad_markers":[],"evidence":"Закрыл лонг по тонкоину в плюс"}

Сообщение: Реклама. Канал с сигналами, erid: 2VtzqvExample, промокод NEWS.
{"msg_type":"ad","coins":[],"direction":null,"stance":0,"confidence":0.95,"entry_low":null,"entry_high":null,"stop":null,"targets":[],"horizon":"unknown","leverage_mentioned":null,"market_view":null,"refers_to_previous":false,"update_hint":null,"update_type":null,"is_ad":true,"ad_markers":["реклама","erid","промокод"],"evidence":"erid: 2VtzqvExample"}

Сообщение: Доброе утро. Интересная монета на скрине, потом гляну.
{"msg_type":"noise","coins":[],"direction":null,"stance":0,"confidence":0.7,"entry_low":null,"entry_high":null,"stop":null,"targets":[],"horizon":"unknown","leverage_mentioned":null,"market_view":null,"refers_to_previous":false,"update_hint":null,"update_type":null,"is_ad":false,"ad_markers":[],"evidence":"Интересная монета на скрине"}

Сообщение: По вчерашнему лонгу стоп перенёс на 140.
{"msg_type":"signal","coins":[],"direction":"long","stance":0.3,"confidence":0.55,"entry_low":null,"entry_high":null,"stop":140,"targets":[],"horizon":"unknown","leverage_mentioned":null,"market_view":null,"refers_to_previous":true,"update_hint":"перенос стопа по вчерашнему лонгу","update_type":"stop_moved","is_ad":false,"ad_markers":[],"evidence":"стоп перенёс на 140"}
`;
