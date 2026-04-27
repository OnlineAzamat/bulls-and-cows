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
room-lobby =
    🎮 <b>Xona: <code>{ $roomId }</code></b>

    O'yinchilar ({ $count }):
    { $playerList }

    Do'stlaringizga kodni ulashing:
    <code>/joinroom { $roomId }</code>

label-host = (host)

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

# ── Bluff penalty ─────────────────────────────────────────────────────────────
bluff-penalty =
    🚨 <b>Blef fosh bo'ldi!</b>

    <b>{ $blufferName }</b> <b>{ $attackerName }</b> ga <code>{ $guess }</code> taxmini uchun yolg'on aytdi.
    Haqiqiy natija: 🐂 <b>{ $realBulls }</b> Buqa, 🐄 <b>{ $realCows }</b> Sigir
    Soxta natija:   🐂 <b>{ $fakeBulls }</b> Buqa, 🐄 <b>{ $fakeCows }</b> Sigir

    🔍 Maslahat: { $blufferName } kodidagi { $position }-o'rindagi raqam — <b>{ $digit }</b>.

# ── Elimination ───────────────────────────────────────────────────────────────
player-eliminated =
    💀 <b>{ $targetName } o'yindan chiqdi!</b>

    <b>{ $attackerName }</b> { $targetName } ning kodini topdi: <code>{ $guess }</code>
    { $attackerName } endi keyingi o'yinchiga hujum qiladi.

you-cracked-code =
    🎉 <b>Siz { $targetName } ning kodini topdingiz!</b>

    Ularning siri: <code>{ $code }</code>
    Maqsadingiz yangilandi — davom eting!

# ── Endgame ───────────────────────────────────────────────────────────────────
game-winner =
    🏆 <b>O'yin tugadi!</b>

    G'olib: <b>{ $winnerName }</b> 🎊

    Xona <code>{ $roomId }</code> yopildi. O'yin uchun rahmat!

leaveroom-not-in-room = ℹ️ Siz hech qanday xonada emassiz.
leaveroom-game-active = ❌ Faol o'yin davomida xonani tark etib bo'lmaydi.
room-dissolved = 🚫 Host <code>{ $roomId }</code> xonasini tark etdi. Xona yopildi.
you-left-room = 👋 Siz <code>{ $roomId }</code> xonasini tark etdingiz.
you-were-kicked = ❌ Siz <code>{ $roomId }</code> xonasidan chiqarib yuborldingiz.
already-in-active-room = ⚠️ Siz allaqachon faol xonada siz! Avval uni tugatang yoki tark eting (/leaveroom).
room-closed-by-host = 🚫 Host <code>{ $roomId }</code> xonasini yopdi.
closeroom-not-host = ❌ Faqat host xonani yopa oladi.
closeroom-success = ✅ <code>{ $roomId }</code> xonasi yopildi.

# ── AFK / Timeout ─────────────────────────────────────────────────────────────
turn-skipped-afk = ⏳ <b>{ $playerName }</b> juda uzoq o'yladi! Navbat o'tkazib yuborildi.
bluff-timeout-auto-truth = ⏰ Javob vaqti tugadi! Haqiqat avtomatik yuborildi.

# ── Honest Perk (Swap) ────────────────────────────────────────────────────────
swap-perk-offer =
    🎁 <b>Halol o'yinchi bonusi!</b>

    Siz 4 davrdan beri blef ishlatmadingiz.
    Yashirin kodingizning ikkita raqamini almashtirishni xohlaysizmi?

swap-perk-ask-positions =
    Almashtiradigan ikkita pozitsiya raqamini kiriting (1–4), masalan: <code>1 3</code>
    Pozitsiyalar har xil bo'lishi kerak.

swap-perk-invalid-positions = ❌ Noto'g'ri kiritish. 1–4 orasidagi har xil ikkita son kiriting, masalan: <code>1 3</code>

swap-perk-used = ✅ Kodingiz yangilandi. Taxmin qilishni davom eting!

swap-perk-broadcast = 🔄 <b>{ $playerName }</b> halol o'yinchi bonusini ishlatdi va kodidagi ikkita raqamni almashtirdi!

swap-perk-expired = ⏱ Bonus mavjud emas. Qayta urinib ko'ring.

# ── Leaderboard ───────────────────────────────────────────────────────────────
top-title = 🏆 <b>Eng yaxshi o'yinchilar:</b>
top-empty = ℹ️ Hali hech kim o'ynamagan. Birinchi bo'lib o'ynang!
top-label-wins = g'alaba
top-label-games = o'yin
top-error = ❌ Reyting jadvalini yuklab bo'lmadi. Keyinroq urinib ko'ring.

# ── Buttons ───────────────────────────────────────────────────────────────────
btn-language-ru = 🇷🇺 Русский
btn-language-uz = 🇺🇿 O'zbek
btn-start-game = 🚀 O'yinni boshlash
btn-tell-truth = ✅ Haqiqatni aytish
btn-bluff = 🎭 Blef qilish
btn-leave-room = 🚪 Xonadan chiqish
btn-use-swap-perk = 🎁 Bonus: raqamlarni almashtirish
