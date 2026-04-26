# --- Onboarding ---
choose-language = Выберите язык / Tilni tanlang:

welcome =
    Добро пожаловать в <b>X-Code</b>! 🎮

    Это многопользовательская логическая игра с механикой блефа.
    Угадывайте секретные коды соперников и не давайте угадать свой!

    Используйте меню ниже, чтобы начать.

# --- Profile ---
profile =
    👤 <b>Профиль</b>

    Имя: { $name }
    Игр сыграно: { $games }
    Побед: { $wins }

profile-not-found = Профиль не найден. Отправьте /start чтобы зарегистрироваться.

# --- Room ---
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

game-started =
    🚀 <b>Игра началась!</b>

    Комната: <code>{ $roomId }</code>
    Участников: { $count }

    ⏳ Следующий шаг будет объявлен в ближайшее время...

not-enough-players = ❌ Недостаточно игроков. Нужно минимум 2 для старта.

not-host = ❌ Только создатель комнаты может начать игру.

room-status-playing = ℹ️ Игра уже идёт.

# --- Buttons ---
btn-language-ru = 🇷🇺 Русский
btn-language-uz = 🇺🇿 O'zbek
btn-start-game = 🚀 Начать игру
