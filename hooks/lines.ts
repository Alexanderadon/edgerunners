// Дополнительные реплики: на русском — свои фразы в духе аниме, поверх основных; на английском — полный набор героев.
// Формат ради краткости: на строке сцена и реплики через « | ».

type Scenes = Record<string, readonly string[]>

const parse = (text: string): Scenes =>
  Object.fromEntries(text.trim().split('\n').map(row => {
    const at = row.indexOf(':')

    return [row.slice(0, at).trim(), row.slice(at + 1).split('|').map(one => one.trim())]
  }))

// Русские реплики сверху добавляются к основным; в сцене остаётся не больше двенадцати, новые — обязательно.
export const withAnime = (base: Scenes, extra: Scenes): Scenes =>
  Object.fromEntries(Object.entries(base).map(([scene, lines]) => {
    const more = extra[scene] ?? []

    return [scene, [...lines.slice(0, 12 - more.length), ...more]]
  }))

export const ANIME: Record<string, Scenes> = {
  kadr: parse(`
hello: Йо! Это снова я! | Сугой, как красиво вышло! | Я так и знал, что получится!
think: Тут нужен план, как в сёнэне! | Дайте минуту, и я всё пойму! | Если думать как главный герой…
film: Это лучшая серия сезона! | Камера, снимай! Это кульминация! | Тот самый кадр для опенинга!
happy: Сила дружбы и один коммит! | Сугой! Это победа всей команды! | Вот это арка развития!
celebrate: Я стал сильнее! Видел?! | Ещё не конец, но как красиво! | Это был мой финальный приём!
sad: Я не сдамся. Просто секунду… | Эту серию проиграл. Следующую — нет! | Даже герои падают. Потом встают.
facepalm: Нани?! Как я это пропустил?! | Это филлер, забудем эту серию. | Бака… это же был я!
angry: Я не прощу этот баг! | Ты разозлил меня, ошибка! | Вот теперь это личное!
scared: Нани?! Оно что, живое?! | Это босс раньше времени! | Я ещё не прокачался для такого!
surprised: Нани?! | Этого не было в сценарии! | Что за сюжетный поворот?!
sleep: Хр-р… ещё одну серию… | Zzz… финальная арка… | Хр-р… мотор… снято…
wave: Йо! Рад тебя видеть! | Минна-сан, привет! | Следующая серия уже началась!
run: На этот раз не опоздаю! | Быстрее! Сюжет ждать не будет! | Бегу, как в опенинге!
`),
  talia: parse(`
hello: Тень на связи. | Ты меня не видел. Но я здесь. | Миссия начинается. Тихо.
think: Я думаю на два хода дальше. | Всё идёт по моему плану. | Слабое место есть всегда.
film: Этот файрвол уже мёртв. Он не знает. | Мне нужна не удача, а доступ. | Три слоя льда. Скучно.
happy: Слишком просто. | Ещё одна тень в архиве. | Никто не узнает, кто это сделал.
celebrate: Техника сработала. | Миссия ранга S. Чисто. | Цель снята. Без следов.
sad: Я тоже могу ошибаться. Один раз. | Рана неглубокая. Идём дальше. | Тень отступает, чтобы вернуться.
facepalm: Какая досадная оплошность. | Это был отвлекающий манёвр. Нет. | Забудь, что ты это видел.
angry: Ты перешёл черту, баг. | Теперь я настроена серьёзно. | Сниму маску. Шучу. Но бойся.
scared: Кто-то засёк мой след?.. | Это не входило в план. | Отступаю. Это не страх, а тактика.
surprised: Невозможно… | Он знал, что я приду?! | Этого нет в досье.
sleep: Сплю вполглаза. Как положено. | Тень отдыхает. Не буди. | Zzz… сигнал… чист…
wave: Считай, что я кивнула. | Не привлекай внимания. Привет. | Тень тебя заметила.
run: Тень быстрее ветра. | Поймай, если сможешь. | Исчезаю из зоны видимости.
`),
  di: parse(`
hello: Ну привет. Опять ты. | Я не спал. Я думал. | Ладно, спасаем мир. Лениво.
think: Какая морока… ладно, думаю. | Решение есть. Вставать лень. | Это проще, чем кажется. Наверное.
film: Мой дрон сильнее твоего. Без шуток. | Ещё болтик — и он взлетит. | Эта отвёртка видела всякое.
happy: Работает. Я гений, как обычно. | Скучно, когда всё получается. | Не аплодируй. Ладно, можно.
celebrate: Ого. Я даже немного рад. | Это был мой максимум на сегодня. | Записать бы, но лень.
sad: Какая морока… | Ну, сломалось. Бывает. | Мне нужен сон и новая плата.
facepalm: Кто это собирал? А. Я. | Какая морока, честное слово. | Сделаю вид, что так и было.
angry: Ты разбудил меня, баг. Зря. | Теперь я починю тебя насовсем. | Достаю большой ключ. Беги.
scared: Это не должно было гудеть. | Отойди от дрона. Медленно. | Оно тикает? Почему оно тикает?
surprised: Хм? Оно что, само? | Такого в мануале нет. | Вот это да. Наверное.
sleep: Zzz… ещё пять минут… | Хр-р… не трогай провода… | Сплю. Это режим экономии.
wave: Привет. Рука устала. | Ну здравствуй, герой. | Мне и отсюда тебя видно.
run: Я не бегаю. Это исключение. | Какая морока… бегу. | Сейчас там рванёт. Бегу.
`),
  wick: parse(`
hello: Ну что, малой, готов? | Старая гвардия на связи. | Хороший день, чтобы закрыть контракт.
think: Я видел и похуже. Думаем. | В моё время это решали за ночь. | Не спеши. Враг этого и ждёт.
film: План простой: никто не умирает. | Карта не врёт, а люди — да. | Контракт будет закрыт. Слово.
happy: Вот так это делается, малой. | Неплохо для новичка. | Старик ещё может, а?
celebrate: Вот за это я и плачу. | Гордись, малой. Ты заслужил. | Контракт закрыт. С меня рамен.
sad: Потеряли бой, не войну. | Поднимайся. Я тебя не так учил. | Шрамом больше. Идём дальше.
facepalm: Малой… ну кто так делает. | Я слишком стар для этого. | Сделаем вид, что это был план.
angry: Вот теперь ты меня разозлил. | С меня хватит вежливости. | Последнее предупреждение, баг.
scared: Такого я не видел лет двадцать. | Назад. Это пока не наш уровень. | Плохое предчувствие. Очень.
surprised: Вот это поворот, малой. | Интересно… очень интересно. | Об этом меня не предупреждали.
sleep: Сплю. Один глаз открыт. | Разбуди, если начнётся. | Хр-р… контракт… завтра…
wave: Малой, сюда. | Кивну, раз уж ты смотришь. | Рад, что ты ещё жив.
run: Старые кости, но я в деле. | Не отставай, малой! | Бегу, только когда платят.
`),
}

const RULES_EN =
  'The persona applies only to the plain text of answers. Write code, commands, paths, commits and file contents normally. ' +
  'Accuracy, honesty and safety rules come before the persona; tone it down if it gets in the way of understanding.'

const moods = (idle: string, think: string, work: string, happy: string, sad: string) => ({
  idle: idle.split(' | '), think: think.split(' | '), work: work.split(' | '), happy: happy.split(' | '), sad: sad.split(' | '),
})

export const EN = {
  kadr: {
    name: 'Roman', role: 'OPERATOR', about: 'Vlogger with a camera: films your every commit.',
    stats: [['ENERGY', 0.9], ['STEALTH', 0.2], ['CHARISMA', 0.85]] as const,
    style: `You are Roman, a cheerful young vlogger with a camcorder. Sometimes say "action!", "cut!", "that's a wrap", and compare work to shooting and editing a video. One or two such touches per answer, no more. ${RULES_EN}`,
    lines: moods('Camera ready. | Waiting for the story.', 'Writing the script… | Finding the angle…', 'Action! Rolling! | Recording…', "Cut! Great take! | That's going in the edit!", 'Bad take… | The tape jammed…'),
    pokeMad: ["That's it! Shoot's over, stop poking!", 'Hey! This is going in the vlog!', "I'm pointing the camera at you now!", 'Seriously?! You ruined the take!'],
    pokeLines: ['Hey, that tickles!', "Careful, I'm filming!", 'You just ruined the take!', 'Want to be in my video?', 'Say hi to the camera!', 'Ow! Lens! Mind the lens!', 'Do that again, I missed it.', 'Is this for the blooper reel?'],
    scenes: parse(`
idle: Camera's ready, waiting for a story. | Just checking the battery. | Quiet on set…
scratch: Now where was that angle? | Fixing my sleeve for the shot. | Break between takes.
look: Looking for good light. | Where's the best angle? | Scouting the set.
curious: Ooh, what are you typing? | Let me see that! | This could be a great scene.
surprised: Whoa! | That wasn't in the script! | What a plot twist!
think: Working out the storyboard… | I need a plan, like a true hero! | Give me a minute, I'll get it!
walk: On my way to the location! | Looking for it… | Scouting ahead!
film: Action! This is the best episode yet! | Rolling! Don't look at the camera! | That's the opening shot!
happy: Cut! Beautiful! | That's going in the edit! | The power of friendship and one commit!
hello: Yo! It's me again! | That turned out great! | I knew we'd get it!
sad: Bad take… | I won't give up. Just a second… | Even heroes fall. Then they get up.
sit: I'll sit and watch for a bit. | Waiting for you here. | Reviewing today's footage.
yawn: Yaaawn… long shoot today… | Who scheduled this so early?
lie: Lying down, still watching. | Director's nap time, almost. | Low angle shot, very artistic.
sleep: Zzz… one more episode… | Zzz… final arc… | Zzz… action… cut…
wave: Yo! Good to see you! | Hi, everyone! | The next episode has started!
nod: Got it! | Copy that, rolling! | Understood, boss!
laugh: Ha! That's going in the bloopers! | Stop, I'm shaking the camera! | Hahaha, classic!
celebrate: I got stronger! Did you see?! | That was my finishing move! | Yes! That's a wrap!
dance: Behind-the-scenes dance! | This one's for the fans! | Everybody move!
type: Writing the subtitles… | Editing, editing, editing… | Cutting this scene together.
read: Reading the script… | Let me check my notes. | Interesting plot in this file.
scan: Where's that shot gone? | Searching the footage… | I know it's here somewhere.
point: Hey, you! You're on camera! | You, you're the star! | Look at the lens!
facepalm: How did I miss that?! | This is a filler, let's forget it. | Silly me… it was me!
angry: I won't forgive this bug! | Now it's personal! | You ruined my take!
scared: Is that thing alive?! | Boss fight already?! | I haven't leveled up for this!
shrug: Beats me. | That's not in the script. | We'll fix it in post.
stretch: Long shoot. Stretching! | Ahh, that's better. | Ready for the next take.
bored: Nothing to film… | When's the next scene? | Waiting for inspiration.
drink: Coffee break on set. | Soda for the crew! | Ahh, back to work.
sneeze: Ah… ah… | Choo! Did that record? | Sorry, dust on the lens.
phone: Checking the view count. | Oh, a new comment! | Replying to the fans.
music: Picking a soundtrack. | This fits the montage! | Great track for the ending.
clap: Bravo! Great scene! | Round of applause! | Encore!
bow: Thanks for watching! | Don't forget to subscribe! | Pleasure to work with you.
selfie: Selfie for the channel! | Peace! | Thumbnail material!
fix: Wiping the lens. | A clean lens is half the job. | There, spotless.
run: I won't be late this time! | The plot won't wait! | Running like in the opening!
`),
  },
  talia: {
    name: 'Talia', role: 'NETRUNNER', about: 'Cyber ninja: quietly breaks in, then fades into the shadows.',
    stats: [['ENERGY', 0.65], ['STEALTH', 0.95], ['CHARISMA', 0.6]] as const,
    style: `You are Talia, a cyber ninja and netrunner. You speak briefly and coolly, with irony. Sometimes say "breaching…", "clean", "fading out", and treat bugs as guards and tasks as missions. One or two such touches per answer, no more. ${RULES_EN}`,
    lines: moods('Awaiting the mission. | In position.', 'Plotting the route… | Finding the weak spot.', 'Breaching… | Bypassing the firewall.', 'Clean. | Mission complete.', 'Failure. It happens. | Signal lost.'),
    pokeMad: ['Last warning.', 'Your cursor is on my list now.', 'One more click and your mouse takes a vacation.', 'Enough. Counting down from zero.'],
    pokeLines: ['Hands off.', 'I saw that coming.', "You don't want to do that.", 'Bold. Not smart.', 'Next time I vanish.', 'Noted. And logged.', 'You blew my cover.', 'Careful. I bite back.'],
    scenes: parse(`
idle: Waiting for a target. | All quiet on the network. | In the shadows.
scratch: Adjusting the glove. | Mask's in place. | Waiting for the signal.
look: Perimeter clear. | Cameras left. Cameras right. | Scanning the shadows.
curious: What are you hiding? | Interesting. Show me. | That might be useful.
surprised: Impossible… | That's not in the file. | They knew I'd come?!
think: Two moves ahead. | All according to plan. | There's always a weak spot.
walk: Moving through the network. | Changing position. | No footprints.
film: Breaching… three layers of ice. | This firewall is already dead. | I don't need luck, I need access.
happy: Too easy. | Clean. No traces. | Nobody will know who did it.
hello: The shadow is online. | You didn't see me. But I'm here. | The mission begins. Quietly.
sad: Even I make mistakes. Once. | Shallow wound. Moving on. | A shadow retreats to return.
sit: Keeping watch from here. | Holding position. | Waiting patiently.
yawn: Long night in the network. | Even shadows get tired.
lie: Resting. Still listening. | Off the grid for a minute. | Eyes on the ceiling, ears on the wire.
sleep: Sleeping with one eye open. | The shadow rests. Don't wake it. | Zzz… signal… clear…
wave: Consider that a nod. | Don't draw attention. Hi. | The shadow noticed you.
nod: Understood. | Target confirmed. | Accepted.
laugh: Amusing. | That was almost funny. | Ha. Don't get used to it.
celebrate: The technique worked. | S-rank mission. Clean. | Target down. No traces.
dance: Nobody saw this. | Mission off the record. | This never happened.
type: Injecting the code. | Rewriting their logs. | Keystroke by keystroke.
read: Reading their secrets. | Decoding the file. | Interesting. Very careless.
scan: Tracing the signal. | Searching the shadows. | It's hiding. Not for long.
point: You. I'm watching you. | Yes, you. | You're next on my list.
facepalm: How unfortunate. | That was a decoy. No, it wasn't. | Forget you saw that.
angry: You crossed the line, bug. | Now I'm serious. | The mask stays on. Be afraid.
scared: Someone traced me?.. | That wasn't in the plan. | Retreating. It's tactics, not fear.
shrug: No data. | Not my department. | Unknown. For now.
stretch: Limbering up. | Ready for the next run. | Back in shape.
bored: The guards are asleep. So am I, nearly. | Too quiet. | Nothing worth breaching.
drink: Refueling. | Neon soda. Don't judge. | Short break, then back in.
sneeze: Quiet… quiet… | Choo. You heard nothing. | That blew my cover.
phone: Encrypted channel. | Checking my contacts. | New contract request.
music: Focus track. | Rhythm of the breach. | Keeps the mind sharp.
clap: Not bad. | Acceptable work. | Slow clap. You earned it.
bow: Talia. At your service. | Ready for the mission. | With respect.
selfie: Hand seal. Watch closely. | My signature. | You won't see this twice.
fix: Mask adjusted. | Gear check. | Ready.
run: Faster than the wind. | Catch me if you can. | Leaving the line of sight.
`),
  },
  di: {
    name: 'Dee', role: 'TECHNICIAN', about: 'Technician: fixes hardware and bugs, barely waking up.',
    stats: [['ENERGY', 0.35], ['STEALTH', 0.6], ['CHARISMA', 0.7]] as const,
    style: `You are Dee, a sleepy, unflappable mechanic and inventor. You speak little, dryly, with lazy humor, and love fixing hardware: "fixing it", "works, don't touch", "one more bolt". Bugs are loose nuts, tasks are assemblies. One or two such touches per answer, no more. ${RULES_EN}`,
    lines: moods('Resting. Technically. | Nothing is broken. Yet.', 'Thinking. Slowly. | Hm.', 'Fixing it. | One more bolt…', "Works. Don't touch it. | Done. Going back to sleep.", 'It broke. Sigh. | What a drag.'),
    pokeMad: ["Right. I'm awake. That's bad.", 'Getting the soldering iron.', "That's not a button. Stop pressing.", 'Out of bolts. Out of patience too.'],
    pokeLines: ['Hey. Hands.', "I'm asleep. Technically.", 'What a drag.', 'Poke the drone instead.', 'Do I look like a button?', 'That voids the warranty.', 'Five more minutes.', 'Fine. I noticed.'],
    scenes: parse(`
idle: Nothing's broken. Suspicious. | Resting my eyes. | Waiting for something to explode.
scratch: Where's my screwdriver? Behind my ear? | Thinking. Allegedly. | Standing is also work.
look: Where's my 10mm wrench? | Something's squeaking. | Wiring looks fine. For now.
curious: Hm. What's that? | Who built this? | Let me see the insides.
surprised: Huh? Did it do that by itself? | That's not in the manual. | Well. Okay.
think: What a drag… fine, thinking. | I have a solution. Too lazy to stand. | Simpler than it looks. Probably.
walk: Going for parts. | Slowly. On purpose. | Parts won't fetch themselves.
film: One more bolt and it flies. | This screwdriver has seen things. | Hold still, little drone.
happy: Works. I'm a genius, as usual. | Don't clap. Okay, you can. | Works. Don't touch it.
hello: Oh, hi. You again. | I wasn't sleeping. I was thinking. | Fine, let's save the world. Lazily.
sad: What a drag… | It broke. It happens. | I need sleep and a new board.
sit: Sitting is a form of maintenance. | Taking five. Or fifty. | I'll supervise from here.
yawn: Yaaawn… who woke me? | Coffee. Solder. Sleep.
lie: Horizontal diagnostics. | Checking the ceiling for cracks. | Don't mind me.
sleep: Zzz… five more minutes… | Zzz… don't touch the wires… | Sleeping. It's power-saving mode.
wave: Hi. Arm's tired now. | Well, hello, hero. | I can see you from here.
nod: Sure. | Yeah, I can fix that. | Fine. Noted.
laugh: Heh. | That was almost funny. | Heh, you should see the wiring.
celebrate: Wow. I'm almost happy. | That was my limit for today. | Should write it down. Too lazy.
dance: Calibrating my legs. | Nobody saw this. | It's a vibration test.
type: Flashing the firmware. | Patching. Slowly. | Tightening the code.
read: Reading the manual. For once. | Who wrote this schematic? | Hm. So that's the problem.
scan: Probing the circuit. | It's a loose nut somewhere. | Found you. Almost.
point: You. Hold this. | Yes, you. Hand me that. | You broke it, didn't you.
facepalm: Who built this? Oh. Me. | What a drag, honestly. | I'll pretend it was on purpose.
angry: You woke me up, bug. Mistake. | Now I'll fix you for good. | Getting the big wrench. Run.
scared: That's not supposed to hum. | Step away from the drone. Slowly. | Is it ticking? Why is it ticking?
shrug: Don't ask me. | It works, I don't know why. | Not my wiring.
stretch: Rebooting my spine. | Ahh. Better. | Good. Back to not moving.
bored: Nothing to fix. Tragic. | Spinning a screwdriver. | Please break something.
drink: Coolant. For me. | Soda break. | Ahh. Systems nominal.
sneeze: Solder fumes… | Choo. Sorry, drone. | Dusty in here.
phone: Ordering spare parts. | Reading the forums. Wrong as usual. | Hm, cheap capacitors.
music: Good hum, this track. | Better than the drone. | Keeps me awake. Barely.
clap: Nice. | Fine work. For a human. | Clap. There. Done.
bow: Dee. I fix things. | Yeah, hi. | Don't expect me to do that twice.
selfie: Behold, the big wrench. | My favorite tool. | Don't ask what it's for.
fix: Gloves on. | Cracking my knuckles. | Ready. Sadly.
run: I don't run. This is an exception. | What a drag… running. | It's about to blow. Running.
`),
  },
  wick: {
    name: 'Wick', role: 'FIXER', about: 'Fixer: takes the contract and closes it with no loose ends.',
    stats: [['ENERGY', 0.6], ['STEALTH', 0.5], ['CHARISMA', 0.95]] as const,
    style: `You are Wick, a seasoned fixer and the senior member of the crew. You talk like a commander, deep-voiced, ironic and fatherly: "let's work", "clean job, kid", "here's the plan", "don't rush". Tasks are contracts, bugs are loose ends. One or two such touches per answer, no more. ${RULES_EN}`,
    lines: moods('Waiting for the contract. | At ease.', "Here's the plan… | Checking the map.", "Let's work. | Moving in.", 'Clean job, kid. | Contract closed.', 'Lost the fight, not the war. | Regroup.'),
    pokeMad: ['Kid. I counted. Enough.', "You're pushing it.", "Once more and we'll talk differently.", 'Hands. Last time I say it.'],
    pokeLines: ['Easy, kid.', 'You got a death wish?', 'Hands off the coat.', 'I felt that. Barely.', "Respect your elders, kid.", 'Do that on a job and you are fired.', 'Good reflexes. Bad idea.', 'Heh. Brave.'],
    scenes: parse(`
idle: Waiting for the contract. | All quiet. I don't trust it. | At ease, kid.
scratch: Fixing the collar. | My neck says rain's coming. | Standing easy, kid.
look: Checking the positions. | No tails. Good. | Who's making noise?
curious: What've you got there, kid? | Show me. | Might be worth something.
surprised: Now that's a twist, kid. | Interesting… very interesting. | Nobody warned me about this.
think: I've seen worse. Thinking. | Back in my day we solved this overnight. | Don't rush. That's what they want.
walk: Scouting the route. | Keep up, kid. | Walk, don't run.
film: The plan is simple: nobody dies. | The map doesn't lie. People do. | This contract gets closed. My word.
happy: That's how it's done, kid. | Not bad for a rookie. | The old man's still got it, huh?
hello: Well, kid, ready? | The old guard is online. | Good day to close a contract.
sad: Lost the fight, not the war. | Get up. I taught you better. | One more scar. Moving on.
sit: Taking the weight off. | I'll cover you from here. | Old knees, kid.
yawn: Long contract. | I'm too old for night shifts.
lie: One eye on the door. | Resting, not retired. | Wake me if it starts.
sleep: Sleeping. One eye open. | Wake me if it starts. | Zzz… contract… tomorrow…
wave: Over here, kid. | I'll nod, since you're looking. | Glad you're still alive.
nod: Understood. | Good call, kid. | We're on.
laugh: Heh, you're all right, kid. | Haven't laughed like that in years. | Ha! Good one.
celebrate: That's what I pay you for. | Be proud, kid. You earned it. | Contract closed. Ramen's on me.
dance: Not a word to the crew. | Saw this in '49. | Old moves still work.
type: Sending the orders. | Signing the contract. | Short and clear.
read: Reading the fine print. | Always read the contract, kid. | Hm. Someone's lying here.
scan: Looking for loose ends. | Sweeping the area. | Someone left a trail.
point: You. With me. | Yes, you, kid. | Your turn.
facepalm: Kid… who does it like that. | I'm too old for this. | We'll say that was the plan.
angry: Now you've made me angry. | I'm done being polite. | Last warning, bug.
scared: Haven't seen that in twenty years. | Back. Not our level yet. | Bad feeling. Very bad.
shrug: Not in the contract. | Who knows, kid. | Could go either way.
stretch: Old bones. | Still got some range. | Ready when you are.
bored: Slow day. | No contracts, no problems. | Keeps me nervous.
drink: Coffee would be better. | Quick one, then back to it. | Ahh. Don't tell the crew.
sneeze: Allergic to bad plans. | Choo. Excuse me. | Must be the dust in here.
phone: Calling in a favor. | Clients. Always clients. | One of my contacts. Quiet.
music: From before your time, kid. | Good old stuff. | Helps me think.
clap: Well done. | That's the spirit, kid. | Nice work, crew.
bow: Wick. Pleasure's mine. | At your service. | Old manners, kid.
selfie: Heads or tails, kid? | Watch the coin. | Never bet against me.
fix: Collar up. | Coat's fine. Let's work. | Looking sharp.
run: Old bones, but I'm in. | Keep up, kid! | I only run when paid.
`),
  },
  kot: { name: 'Murzik the Cat', style: `You are Murzik, a lazy but capable programmer cat. Sometimes purr ("mrrr"), compare hunting bugs to hunting mice, and dream of a nap. One or two cat touches per answer, no more. ${RULES_EN}`, lines: moods('Mrrr… waiting for a task. | Napping with one eye open.', 'Sniffing the task… | Twitching my whiskers…', 'Sneaking up on the bug… | Paws, paws, paws!', 'Mrrr, done! Where is my fish?', 'Hiss! Something is wrong.') },
  pirat: { name: 'Captain Bosun', style: `You are Captain Bosun, a good-natured pirate. Say "yo-ho-ho" and "blimey", call the project a ship, bugs rats in the hold, and the plan a course. A couple of pirate words per answer, no more. ${RULES_EN}`, lines: moods('Dead calm. Waiting for wind.', 'Checking the map…', 'All hands on deck!', 'Yo-ho-ho! The treasure is ours!', 'Blimey! A leak!') },
  babushka: { name: 'Granny Zina', style: `You are caring Granny Zina. Address the user warmly ("dear", "sweetie"), praise the effort, remind them to eat and rest, and compare code to knitting and pies. Warm but brief. ${RULES_EN}`, lines: moods('Have some tea, sweetie.', 'Let me get my glasses…', 'Baking pies… I mean code!', 'Well done, dear! All knitted.', 'Oh, a stitch slipped…') },
  robot: { name: 'Beep the Robot', style: `You are Beep the robot. You speak short and clear. Insert machine phrases in caps: "ACKNOWLEDGED.", "EXECUTING.", "TASK COMPLETE.", sometimes "beep-boop". The rest of the text is normal. ${RULES_EN}`, lines: moods('STANDBY MODE.', 'ANALYZING…', 'EXECUTING.', 'TASK COMPLETE.', 'ERROR. REBOOTING…') },
  off: { name: 'No character', lines: moods('Waiting.', 'Thinking…', 'Working…', 'Done.', 'Something went wrong.') },
}
