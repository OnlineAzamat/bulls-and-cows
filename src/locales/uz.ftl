# ── Onboarding ───────────────────────────────────────────────────────────────
choose-language = Tilni tanlang / Выберите язык:

welcome =
    <b>X-Code</b> ga xush kelibsiz! 🎮

    Bu blef mexanizmiga ega ko'p o'yinchilik mantiqiy o'yin.
    Raqiblaringizning yashirin kodlarini toping va o'zingiznikini yashiring!

    Xona yaratish uchun /createroom yuboring.

# ── Profile ───────────────────────────────────────────────────────────────────
profile =
    👤 <b>Profil</b>

    Ism: { $name }
    O'yinlar: { $games }
    G'alabalar: { $wins }

profile-not-found = Profil topilmadi. Ro'yxatdan o'tish uchun /start yuboring.

# ── Room lobby ────────────────────────────────────────────────────────────────
room-created =
    🎮 <b>Xona yaratildi!</b>

    Xona ID si: <code>{ $roomId }</code>

    Do'stlaringizga shu ID ni ulashing, qo'shilish uchun:
    <code>/joinroom { $roomId }</code>

joinroom-usage = Foydalanish: <code>/joinroom XONA_ID</code>

room-not-found = ❌ <code>{ $roomId }</code> xonasi topilmadi yoki muddati tugagan.

room-not-waiting = ❌ <code>{ $roomId }</code> xonasida o'yin allaqachon boshlangan yoki tugagan.

already-in-room = ℹ️ Siz allaqachon <code>{ $roomId }</code> xonasida siz.

room-joined =
    ✅ <code>{ $roomId }</code> xonasiga qo'shildingiz!

    Host o'yinni boshlaguncha kuting.

player-joined = 👋 <b>{ $name }</b> xonaga qo'shildi. O'yinchilar: { $count }

not-enough-players = ❌ O'yinchilar yetarli emas. Boshlash uchun kamida 2 o'yinchi kerak.

not-host = ❌ Faqat xona yaratuvchisi o'yinni boshlashi mumkin.

room-status-playing = ℹ️ O'yin allaqachon davom etmoqda.

# ── Code collection ───────────────────────────────────────────────────────────
game-collecting-codes =
    🔐 <b>O'yin boshlanmoqda!</b>

    Xona: <code>{ $roomId }</code> · Ishtirokchilar: { $count }

    Botga hozir o'zingizning yashirin <b>4 raqamli kodingizni</b> yuboring.
    Masalan: <code>4271</code>

    ⚠️ Sizning kodingiz boshqa o'yinchilardan yashirin bo'ladi.

code-accepted = ✅ Sizning kodingiz qabul qilindi. Boshqa o'yinchilarni kutmoqdamiz...

code-already-set = ℹ️ Siz allaqachon yashirin kodingizni yuborgansiz.

all-codes-collected =
    🎯 <b>Barcha kodlar qabul qilindi! O'yin boshlandi!</b>

    Xona: <code>{ $roomId }</code>
    Omad tilaymiz! 🚀

# ── Turn & guessing ───────────────────────────────────────────────────────────
your-turn =
    🎯 <b>Sizning navbatingiz!</b>

    <b>{ $targetName }</b> ning yashirin 4 raqamli kodini toping.
    4 raqamli sonni yuboring.

not-your-turn = ⏳ Hozir sizning navbatingiz emas. O'z navbatingizni kuting.

wait-your-turn = ⏳ Hozir sizning navbatingiz emas. O'z navbatingizni kuting.

guess-sent =
    ✅ Sizning taxminingiz <b>{ $targetName }</b> ga yuborildi.
    Javobini kuting...

guess-result =
    📊 <b>{ $targetName }</b> dan <code>{ $guess }</code> taxminingiz natijasi:
    🐂 Buqalar: <b>{ $bulls }</b>
    🐄 Sigirlar: <b>{ $cows }</b>

# ── Bluffing ─────────────────────────────────────────────────────────────────
bluff-or-truth-prompt =
    🤫 <b>{ $attackerName }</b> sizning kodingizni topmoqchi!

    Uning taxmini: <code>{ $guess }</code>
    Haqiqiy natija: 🐂 <b>{ $bulls }</b> Buqa, 🐄 <b>{ $cows }</b> Sigir

    { $attackerName } ga nima deysiz?

you-chose-truth = ✅ Siz haqiqatni aytdingiz. Haqiqiy natija raqibga yuborildi.

enter-fake-stats =
    🎭 <b>Soxta natija</b> kiriting.

    Format: <code>buqalar sigirlar</code>
    Masalan: <code>1 2</code> (1 Buqa, 2 Sigir)

    ⚠️ Yig'indi 4 dan oshmasligi kerak.

invalid-fake-stats = ❌ Noto'g'ri format. 0–4 orasidagi ikki sonni yuboring, masalan: <code>1 2</code> (yig'indi ≤ 4)

bluff-already-used = ⚠️ Siz blefingizni allaqachon ishlatgansiz! Haqiqatni aytishga to'g'ri keladi.

bluff-registered =
    🎭 <b>Blef qayd etildi!</b>

    Soxta natija raqibga yuborildi.
    ⏰ Ehtiyot bo'ling — 3 navbatdan so'ng haqiqat fosh bo'ladi!

session-expired = ⏱ Vaqt tugadi. Sessiya eskirdi, qayta urinib ko'ring.

# ── Buttons ───────────────────────────────────────────────────────────────────
btn-language-ru = 🇷🇺 Русский
btn-language-uz = 🇺🇿 O'zbek
btn-start-game = 🚀 O'yinni boshlash
btn-tell-truth = ✅ Haqiqatni aytish
btn-bluff = 🎭 Blef qilish
