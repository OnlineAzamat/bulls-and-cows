# ── Onboarding ───────────────────────────────────────────────────────────────
choose-language = Выберите язык / Tilni tanlang:

welcome =
    Добро пожаловать в <b>X-Code</b>! 🎮

    Это многопользовательская логическая игра с механикой блефа.
    Угадывайте секретные коды соперников и не давайте угадать свой!

    Используйте /createroom чтобы создать комнату.

# ── Profile ───────────────────────────────────────────────────────────────────
profile =
    👤 <b>Профиль</b>

    Имя: { $name }
    Игр сыграно: { $games }
    Побед: { $wins }

profile-not-found = Профиль не найден. Отправьте /start чтобы зарегистрироваться.

# ── Room lobby ────────────────────────────────────────────────────────────────
room-lobby =
    🎮 <b>Комната: <code>{ $roomId }</code></b>

    Игроки ({ $count }):
    { $playerList }

    Поделитесь кодом с друзьями:
    <code>/joinroom { $roomId }</code>

label-host = (хост)

room-created =
    🎮 <b>Комната создана!</b>

    ID комнаты: <code>{ $roomId }</code>

    Поделитесь этим ID, чтобы друзья могли присоединиться:
    <code>/joinroom { $roomId }</code>

joinroom-usage = Использование: <code>/joinroom ROOM_ID</code>

room-not-found = ❌ Комната <code>{ $roomId }</code> не найдена или её срок действия истёк.

room-not-waiting = ❌ Игра в комнате <code>{ $roomId }</code> уже началась или завершена.

already-in-room = ℹ️ Вы уже находитесь в комнате <code>{ $roomId }</code>.

room-joined =
    ✅ Вы присоединились к комнате <code>{ $roomId }</code>!

    Ожидайте, пока хост не начнёт игру.

player-joined = 👋 <b>{ $name }</b> присоединился к комнате. Игроков: { $count }

not-enough-players = ❌ Недостаточно игроков. Нужно минимум 2 для старта.

not-host = ❌ Только создатель комнаты может начать игру.

room-status-playing = ℹ️ Игра уже идёт.

# ── Code collection ───────────────────────────────────────────────────────────
game-collecting-codes =
    🔐 <b>Игра начинается!</b>

    Комната: <code>{ $roomId }</code> · Участников: { $count }

    Отправьте боту ваш секретный <b>4-значный код</b> прямо сейчас.
    Например: <code>4271</code>

    ⚠️ Ваш код будет скрыт от остальных игроков.

code-accepted = ✅ Ваш код принят. Ожидаем остальных игроков...

code-already-set = ℹ️ Вы уже отправили свой секретный код.

all-codes-collected =
    🎯 <b>Все коды собраны! Игра началась!</b>

    Комната: <code>{ $roomId }</code>
    Следите за подсказками — удачи! 🚀

# ── Turn & guessing ───────────────────────────────────────────────────────────
your-turn =
    🎯 <b>Ваш ход!</b>

    Угадайте секретный 4-значный код игрока <b>{ $targetName }</b>.
    Просто отправьте 4-значное число.

not-your-turn = ⏳ Сейчас не ваш ход. Дождитесь своей очереди.

wait-your-turn = ⏳ Сейчас не ваш ход. Дождитесь своей очереди.

guess-sent =
    ✅ Ваша попытка отправлена <b>{ $targetName }</b>.
    Ожидайте ответа...

guess-result =
    📊 Ответ от <b>{ $targetName }</b> на вашу попытку <code>{ $guess }</code>:
    🐂 Быков: <b>{ $bulls }</b>
    🐄 Коров: <b>{ $cows }</b>

# ── Bluffing ─────────────────────────────────────────────────────────────────
bluff-or-truth-prompt =
    🤫 <b>{ $attackerName }</b> пытается угадать ваш код!

    Его попытка: <code>{ $guess }</code>
    Реальный результат: 🐂 <b>{ $bulls }</b> Быков, 🐄 <b>{ $cows }</b> Коров

    Что вы скажете { $attackerName }?

you-chose-truth = ✅ Вы сказали правду. Реальный результат отправлен противнику.

enter-fake-stats =
    🎭 Введите <b>фальшивый результат</b>.

    Формат: <code>быки коровы</code>
    Пример: <code>1 2</code> (1 Бык, 2 Коровы)

    ⚠️ Сумма не должна превышать 4.

invalid-fake-stats = ❌ Неверный формат. Отправьте два числа 0–4, например: <code>1 2</code> (сумма ≤ 4)

bluff-already-used = ⚠️ Вы уже использовали свой блеф! Придётся говорить правду.

bluff-registered =
    🎭 <b>Блеф зафиксирован!</b>

    Фальшивый результат отправлен противнику.
    ⏰ Осторожно — через 3 хода правда раскроется!

session-expired = ⏱ Время вышло. Сессия устарела, попробуйте снова.

# ── Bluff penalty ─────────────────────────────────────────────────────────────
bluff-penalty =
    🚨 <b>Блеф раскрыт!</b>

    <b>{ $blufferName }</b> солгал <b>{ $attackerName }</b> на попытку <code>{ $guess }</code>.
    Реальный результат: 🐂 <b>{ $realBulls }</b> Быков, 🐄 <b>{ $realCows }</b> Коров
    Ложный результат:   🐂 <b>{ $fakeBulls }</b> Быков, 🐄 <b>{ $fakeCows }</b> Коров

    🔍 Подсказка: цифра на позиции { $position } в коде { $blufferName } — <b>{ $digit }</b>.

# ── Elimination ───────────────────────────────────────────────────────────────
player-eliminated =
    💀 <b>{ $targetName } выбыл!</b>

    <b>{ $attackerName }</b> угадал код <b>{ $targetName }</b>: <code>{ $guess }</code>
    { $attackerName } теперь атакует следующего игрока.

you-cracked-code =
    🎉 <b>Вы разгадали код { $targetName }!</b>

    Их секрет был: <code>{ $code }</code>
    Ваша цель обновлена — продолжайте!

# ── Endgame ───────────────────────────────────────────────────────────────────
game-winner =
    🏆 <b>Игра завершена!</b>

    Победитель: <b>{ $winnerName }</b> 🎊

    Комната <code>{ $roomId }</code> закрыта. Спасибо за игру!

# ── Buttons ───────────────────────────────────────────────────────────────────
leaveroom-not-in-room = ℹ️ Вы не находитесь ни в одной комнате.
leaveroom-game-active = ❌ Нельзя покинуть комнату во время активной игры.
room-dissolved = 🚫 Хост покинул комнату <code>{ $roomId }</code>. Комната закрыта.
you-left-room = 👋 Вы покинули комнату <code>{ $roomId }</code>.
you-were-kicked = ❌ Вас исключили из комнаты <code>{ $roomId }</code>.
already-in-active-room = ⚠️ Вы уже находитесь в активной комнате! Сначала завершите её или покиньте (/leaveroom).
room-closed-by-host = 🚫 Хост закрыл комнату <code>{ $roomId }</code>.
closeroom-not-host = ❌ Только хост может закрыть комнату.
closeroom-success = ✅ Комната <code>{ $roomId }</code> закрыта.

# ── AFK / Timeout ─────────────────────────────────────────────────────────────
turn-skipped-afk = ⏳ <b>{ $playerName }</b> слишком долго думал! Ход пропущен.
bluff-timeout-auto-truth = ⏰ Время на ответ вышло! Правда отправлена автоматически.

# ── Honest Perk (Swap) ────────────────────────────────────────────────────────
swap-perk-offer =
    🎁 <b>Бонус честного игрока!</b>

    Вы честно играли 4 цикла подряд.
    Хотите поменять местами две цифры своего секретного кода?

swap-perk-ask-positions =
    Введите два номера позиций для обмена (1–4), например: <code>1 3</code>
    Позиции должны быть разными.

swap-perk-invalid-positions = ❌ Неверный ввод. Введите два разных числа от 1 до 4, например: <code>1 3</code>

swap-perk-used = ✅ Ваш код обновлён. Теперь угадывайте!

swap-perk-broadcast = 🔄 <b>{ $playerName }</b> использовал бонус честного игрока и поменял две цифры своего кода!

swap-perk-expired = ⏱ Бонус недоступен. Попробуйте снова.

# ── Leaderboard ───────────────────────────────────────────────────────────────
top-title = 🏆 <b>Лучшие игроки:</b>
top-empty = ℹ️ Пока никто не сыграл. Начните игру первыми!
top-label-wins = побед
top-label-games = игр
top-error = ❌ Не удалось загрузить таблицу лидеров. Попробуйте позже.

# ── Game Board ────────────────────────────────────────────────────────────────
game-board =
    🔄 <b>СТАТУС ИГРЫ</b> 🔄

    ▶️ { $action }

    Порядок ходов:
    { $sequence }

game-board-action-guessing = { $attackerName } → { $targetName } угадывает код...

game-board-status-active = ➡️  { $position }. { $name } (Думает...)
game-board-status-waiting = ⏳  { $position }. { $name } (Ожидает)
game-board-status-eliminated = ❌  { $name } (Выбыл)

broadcast-guess-made = 👀 <b>{ $guesserName }</b> сделал попытку! <b>{ $targetName }</b> решает: правда или блеф...
broadcast-target-responded = ✅ <b>{ $targetName }</b> ответил! Ход переходит к следующему игроку.

# ── Buttons ───────────────────────────────────────────────────────────────────
btn-language-ru = 🇷🇺 Русский
btn-language-uz = 🇺🇿 O'zbek
btn-start-game = 🚀 Начать игру
btn-tell-truth = ✅ Сказать правду
btn-bluff = 🎭 Блефовать
btn-leave-room = 🚪 Покинуть комнату
btn-use-swap-perk = 🎁 Использовать бонус: поменять цифры
