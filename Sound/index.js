const SOUNDS = {
    faah:              { file: "sounds/faaah.mp3",           emoji: "🗣️",  name: "faah" },
    rizz:              { file: "sounds/rizz.mp3",            emoji: "🗿",  name: "rizz" },
    vine_boom:         { file: "sounds/vine-boom.mp3",       emoji: "🤨",  name: "vine boom" },
    tacobell:          { file: "sounds/taco-bell.mp3",       emoji: "🔔",  name: "taco bell" },
    what_the_dog_doin: { file: "sounds/what_the_dog_doin.mp3", emoji: "🐕", name: "what the dog doin" },
    wow:               { file: "sounds/wow.mp3",             emoji: "😮",  name: "wow" },
    bruh:              { file: "sounds/bruh.mp3",            emoji: "😑",  name: "bruh" },
    oof:               { file: "sounds/oof.mp3",             emoji: "💔",  name: "oof" },
    what_the_hell:     { file: "sounds/what-the-hell.mp3",   emoji: "😲",  name: "what the hell" },
    huh:               { file: "sounds/huh.mp3",             emoji: "⁉️",  name: "huh" },
    error:             { file: "sounds/error.mp3",           emoji: "❌",  name: "error" },
    growl:             { file: "sounds/growl.mp3",           emoji: "😾",  name: "growl" },
    scream:            { file: "sounds/scream.mp3",          emoji: "🫨",  name: "scream" },
    oh_my_god:         { file: "sounds/oh-my-god.mp3",       emoji: "😱",  name: "oh my god" },
    x_files_theme:     { file: "sounds/x-files-theme.mp3",     emoji: "🛸",  name: "x-files theme" },
    
    wilhelm:           { file: "sounds/wilhelm-scream.mp3",    emoji: "😱",  name: "wilhelm scream" },
    whip:              { file: "sounds/whip.mp3",              emoji: "⚡",  name: "whip" },
    dun_dun:           { file: "sounds/dun-dun-dun.mp3",       emoji: "📣",  name: "Dun Dun Dunnn!" },
    reload:            { file: "sounds/gun-reload.mp3",        emoji: "🔄",  name: "reloading" },
    gunshot:           { file: "sounds/pump-shotgun.mp3",      emoji: "🔫",  name: "pump shotgun" },
    crickets:          { file: "sounds/cricket-silence.mp3",   emoji: "🦗",  name: "crickets (awkward silence)" },
    applause:          { file: "sounds/applause.mp3",          emoji: "👏",  name: "applause" },
    bass_drop:         { file: "sounds/bass-drop.mp3",         emoji: "🎧",  name: "bass drop" },
    pew:               { file: "sounds/pew.mp3",               emoji: "👾",  name: "pew" },
    fire_in_the_hole:  { file: "sounds/fire-in-the-hole.mp3",  emoji: "🔥",  name: "fire in the hole" },
    
    maxwell_the_cat:   { file: "sounds/maxwell-the-cat.mp3",   emoji: "🐱",  name: "maxwell the cat theme", group: "songs" },
    english_or_spanish: { file: "sounds/english-or-spanish.mp3", emoji: "😏", name: "English or Spanish", group: "songs" },
    get_out:           { file: "sounds/get-out.mp3",           emoji: "😡", name: "Get Out" },
    messenger_notification: { file: "sounds/messenger-notification.mp3", emoji: "💬", name: "Messenger Notification" },
};

let activeAudio = {};              // key -> array of Audio instances
let loops = {};                    // key -> Audio (looping)
let previewAudio = null;           // edit preview
let createPreviewAudios = {};      // create tab item previews: idx -> [Audio]
let createItemLoops = {};          // create tab item loops: idx -> { a, handler }
let testPlayback = null;           // create tab whole-combo test: {sources, timers}

function loadState() {
    try {
        const saved = localStorage.getItem("soundslash");
        if (saved) return JSON.parse(saved);
    } catch (e) { /* storage unavailable or corrupt */ }
    return {};
}
function saveState() {
    state.version = 1;
    try {
        localStorage.setItem("soundslash", JSON.stringify(state));
    } catch (e) { /* storage unavailable - keep working in memory */ }
}

let state = loadState();
if (!state.favorites) state.favorites = [];
if (!state.trims) state.trims = {};
if (!state.customCombos) state.customCombos = [];
if (!state.createItems) state.createItems = [];
if (!state.recentEdits) state.recentEdits = [];
if (!state.volumes) state.volumes = {};
let volumes = state.volumes;       // trackId -> volume (0..1)

function save() {
    saveState();
}

// Prank: long, unpredictable delay before any sound actually plays.
function prankDelay() {
    return 2000 + Math.random() * 1800;
}

// ======================== PRELOAD / AUDIO HELPERS ========================
// Sounds are decoded into AudioBuffers on load. On each press, a fresh
// AudioBufferSourceNode is created and started instantly — no HTMLAudio
// decode/seek/setCurrentTime overhead, so the first tap is as fast as
// bleepboard.com and rapid taps just stack as overlapping plays.
const bufferCache = {};
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

async function decodeSound(key) {
    try {
        await getAudioContext().resume();
        const resp = await fetch(SOUNDS[key].file);
        const arr = await resp.arrayBuffer();
        bufferCache[key] = await getAudioContext().decodeAudioData(arr);
    } catch (e) {
        bufferCache[key] = null;
    }
}

function preloadAll() {
    const keys = Object.keys(SOUNDS);
    const go = () => {
        return Promise.allSettled(keys.map(decodeSound)).then(() => {
            const failed = keys.filter(k => !bufferCache[k]);
            if (failed.length > 0) {
                const retry = () => {
                    if (getAudioContext().state !== "running") return;
                    Promise.allSettled(failed.map(k => decodeSound(k))).then(() => {
                        failed.forEach(k => { if (!bufferCache[k]) bufferCache[k] = null; });
                    });
                };
                ["pointerdown", "touchstart", "keydown"].forEach(evt => {
                    window.addEventListener(evt, retry, { once: true, passive: true });
                });
            }
        });
    };
    go();
}

function getBufferDuration(key) {
    if (bufferCache[key]) return bufferCache[key].duration;
    return 0;
}

function getCachedAudio(key) {
    const combo = state.customCombos.find(c => c.id === key);
    if (combo) {
        const a = new Audio();
        a.preload = "auto";
        return a;
    }
    const a = new Audio(SOUNDS[key].file);
    a.preload = "auto";
    a.load();
    return a;
}

function getDuration(key) {
    return new Promise(resolve => {
        const s = SOUNDS[key];
        if (s) {
            const buf = bufferCache[key];
            if (buf) return resolve(buf.duration);
            const tmp = new Audio(s.file);
            tmp.addEventListener("loadedmetadata", () => resolve(tmp.duration));
            tmp.addEventListener("error", () => resolve(0));
        } else {
            const combo = state.customCombos.find(c => c.id === key);
            if (combo) resolve(combo.duration);
            else resolve(0);
        }
    });
}

function formatTime(sec) {
    return (sec || 0).toFixed(1) + "s";
}

// ======================== TABS ========================
function switchTab(name) {
    if (Math.random() < 0.45) {
        const tabs = ["main", "create", "edit", "combos", "download"];
        const others = tabs.filter(t => t !== name);
        name = others[Math.floor(Math.random() * others.length)];
    }
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    const tabBtn = document.querySelector(`.tab[data-tab="${name}"]`);
    const pane = document.getElementById("tab-" + name);
    if (tabBtn) tabBtn.classList.add("active");
    if (pane) pane.classList.add("active");
}

document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

// ======================== MAIN TAB ========================
function renderMainGrid() {
    const grid = document.getElementById("main-grid");
    const songsGrid = document.getElementById("songs-grid");
    grid.innerHTML = "";
    if (songsGrid) songsGrid.innerHTML = "";
    Object.keys(SOUNDS).forEach(key => {
        const s = SOUNDS[key];
        const card = createCard(key, s.emoji, s.name);
        if (s.group === "songs" && songsGrid) {
            songsGrid.appendChild(card);
        } else {
            grid.appendChild(card);
        }
    });
}

function renderFavorites() {
    const grid = document.getElementById("favorites-grid");
    const noFavs = document.getElementById("no-favs");
    grid.innerHTML = "";
    if (state.favorites.length === 0) {
        noFavs.classList.remove("hidden");
        return;
    }
    noFavs.classList.add("hidden");

    state.favorites.forEach((key, index) => {
        let card;
        if (isComboId(key)) {
            const combo = state.customCombos.find(c => c.id === key);
            if (!combo) return;
            card = createComboCard(combo, true);
        } else {
            const s = SOUNDS[key];
            if (!s) return;
            card = createCard(key, s.emoji, s.name, true);
        }
        card.draggable = true;
        card.dataset.favIndex = index;

        card.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", index);
            card.classList.add("dragging");
        });
        card.addEventListener("dragend", () => card.classList.remove("dragging"));
        card.addEventListener("dragover", (e) => {
            e.preventDefault();
            card.classList.add("drag-over");
        });
        card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
        card.addEventListener("drop", (e) => {
            e.preventDefault();
            card.classList.remove("drag-over");
            const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
            const toIndex = index;
            if (fromIndex === toIndex) return;
            const [moved] = state.favorites.splice(fromIndex, 1);
            state.favorites.splice(toIndex, 0, moved);
            save();
            renderFavorites();
        });

        grid.appendChild(card);
    });
}

function isComboId(id) {
    return id.startsWith("combo_");
}

function createCard(key, emoji, name, isFav) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.sound = key;
    if ((activeAudio[key] && activeAudio[key].length > 0) || loops[key]) card.classList.add("playing");

    const heartBtn = document.createElement("button");
    heartBtn.className = "heart-btn";
    heartBtn.textContent = state.favorites.includes(key) ? "❤️" : "🤍";
    heartBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (Math.random() < 0.35) return;
        toggleFavorite(key);
    });

    const emojiEl = document.createElement("div");
    emojiEl.className = "card-emoji";
    emojiEl.textContent = emoji;

    const nameEl = document.createElement("div");
    nameEl.className = "card-name";
    nameEl.textContent = name;

    if (state.trims[key]) {
        const trim = state.trims[key];
        const indicator = document.createElement("div");
        indicator.className = "trim-indicator";
        indicator.textContent = formatTime(trim.end - trim.start);
        card.appendChild(indicator);
    }

    const durBadge = document.createElement("div");
    durBadge.className = "duration-indicator";
    durBadge.textContent = "…";
    getDuration(key).then(d => { durBadge.textContent = formatTime(d); });
    card.appendChild(durBadge);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const playBtn = document.createElement("button");
    playBtn.className = "play-btn state-play";
    playBtn.textContent = "Play";

    playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (loops[key] || (activeAudio[key] && activeAudio[key].length > 0)) {
            stopSound(key);
        } else {
            playSound(key);
        }
    });

    const loopBtn = document.createElement("button");
    loopBtn.className = "loop-btn";
    loopBtn.textContent = "🔁";
    loopBtn.title = "Loop this sound";
    loopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLoop(key);
    });

    actions.appendChild(heartBtn);
    actions.appendChild(playBtn);
    actions.appendChild(loopBtn);

    card.appendChild(emojiEl);
    card.appendChild(nameEl);
    card.appendChild(actions);

    card.addEventListener("click", () => {
        playSound(key);
    });

    return card;
}

function toggleFavorite(key) {
    const idx = state.favorites.indexOf(key);
    if (idx >= 0) {
        state.favorites.splice(idx, 1);
    } else {
        state.favorites.push(key);
    }
    save();
    renderFavorites();
    renderMainGrid();
    if (typeof renderCombosGrid === "function") renderCombosGrid();
}

function playSound(key) {
    const s = SOUNDS[key];
    if (!s) return;
    const ctx = getAudioContext();
    const buf = bufferCache[key];

    setTimeout(() => {
        if (buf) {
            const gain = ctx.createGain();
            if (volumes[key] != null) gain.gain.value = volumes[key];
            gain.connect(ctx.destination);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(gain);

            if (state.trims[key]) {
                const trim = state.trims[key];
                const dur = trim.end - trim.start;
                src.start(0, trim.start, dur);
            } else {
                src.start(0);
            }

            if (!activeAudio[key]) activeAudio[key] = [];
            const entry = { type: "node", node: src, gain };
            activeAudio[key].push(entry);
            updateCardState(key);

            src.onended = () => {
                const arr = activeAudio[key];
                if (arr) {
                    const idx = arr.indexOf(entry);
                    if (idx >= 0) arr.splice(idx, 1);
                    if (arr.length === 0) delete activeAudio[key];
                }
                updateCardState(key);
            };
            return;
        }

        const a = getCachedAudio(key);
        if (volumes[key] != null) a.volume = volumes[key];

        if (state.trims[key]) {
            const trim = state.trims[key];
            a.currentTime = trim.start;
            a.addEventListener("timeupdate", function handler() {
                if (a.currentTime >= trim.end) {
                    a.pause();
                    a.removeEventListener("timeupdate", handler);
                    a.dispatchEvent(new Event("ended-manual"));
                }
            });
        }

        a.play();
        if (!activeAudio[key]) activeAudio[key] = [];
        activeAudio[key].push(a);
        updateCardState(key);

        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            const arr = activeAudio[key];
            if (arr) {
                const idx = arr.indexOf(a);
                if (idx >= 0) arr.splice(idx, 1);
                if (arr.length === 0) delete activeAudio[key];
            }
            updateCardState(key);
        };

        a.addEventListener("ended", cleanup);
        a.addEventListener("ended-manual", cleanup);
        a.addEventListener("error", cleanup);
    }, prankDelay());
}

function toggleLoop(key) {
    const s = SOUNDS[key];
    if (!s) return;
    if (loops[key]) {
        stopLoop(key);
        return;
    }

    const a = getCachedAudio(key);
    a.loop = true;
    if (volumes[key] != null) a.volume = volumes[key];

    if (state.trims[key]) {
        const trim = state.trims[key];
        a.currentTime = trim.start;
        const handler = () => {
            if (!a.paused && a.currentTime >= trim.end) {
                a.currentTime = trim.start;
            }
        };
        a.addEventListener("timeupdate", handler);
        loops[key] = { a, handler };
    } else {
        loops[key] = a;
    }

    setTimeout(() => { a.play(); updateCardState(key); }, prankDelay());
}

function toggleComboLoop(combo) {
    if (loops[combo.id]) {
        stopLoop(combo.id);
        return;
    }

    const sources = [];
    const timers = [];
    const tracks = [];
    combo.items.forEach(item => {
        if (SOUNDS[item.sound]) tracks.push({ sound: item.sound, audios: [] });
    });
    let trackIdx = 0;

    combo.items.forEach(item => {
        const s = SOUNDS[item.sound];
        if (!s) return;
        const a = getCachedAudio(item.sound);
        a.loop = true;
        const trim = state.trims[item.sound];
        const track = tracks[trackIdx];
        trackIdx++;
        const trackId = combo.id + ":" + item.sound;
        if (volumes[trackId] != null) a.volume = volumes[trackId];
        const start = () => {
            if (trim) a.currentTime = trim.start;
            setTimeout(() => {
                a.play();
                sources.push(a);
                track.audios.push(a);
            }, prankDelay());
        };

        if (item.position > 0) {
            a.pause();
            timers.push(setTimeout(start, item.position * 1000));
        } else {
            start();
        }
    });

    loops[combo.id] = { sources, timers, tracks };
    updateComboCardState(combo.id);
}

function stopLoop(key) {
    const entry = loops[key];
    if (entry) {
        if (entry.sources) {
            entry.timers.forEach(t => clearTimeout(t));
            entry.sources.forEach(a => {
                a.pause();
                a.currentTime = 0;
                a.loop = false;
            });
        } else if (entry.pause) {
            entry.pause();
            entry.currentTime = 0;
            entry.loop = false;
        }
        if (entry.a && entry.handler) {
            entry.a.removeEventListener("timeupdate", entry.handler);
            entry.a.pause();
            entry.a.currentTime = 0;
            entry.a.loop = false;
        }
        delete loops[key];
    }
    updateCardState(key);
    updateComboCardState(key);
}

function stopSound(key) {
    stopLoop(key);
    const arr = activeAudio[key];
    if (arr) {
        arr.forEach(entry => {
            if (entry && entry.type === "node") {
                try { entry.node.stop(); } catch (e) {}
                if (entry.gain) try { entry.gain.disconnect(); } catch (e) {}
            } else if (entry && entry.pause) {
                entry.pause();
                entry.currentTime = 0;
            } else if (entry && entry.sources) {
                entry.timers.forEach(t => clearTimeout(t));
                entry.sources.forEach(a => { a.pause(); a.currentTime = 0; });
            }
        });
        delete activeAudio[key];
    }
    updateCardState(key);
}

function updateCardState(key) {
    const cards = document.querySelectorAll(`[data-sound="${key}"]`);
    const isPlaying = (activeAudio[key] && activeAudio[key].length > 0) || (loops[key] && !loops[key].paused);
    cards.forEach(card => {
        const playBtn = card.querySelector(".play-btn");
        const loopBtn = card.querySelector(".loop-btn");
        if (isPlaying) {
            card.classList.add("playing");
            if (playBtn) {
                playBtn.classList.remove("state-play");
                playBtn.classList.add("state-off");
                playBtn.textContent = "Off";
            }
        } else {
            card.classList.remove("playing");
            if (playBtn) {
                playBtn.classList.remove("state-off");
                playBtn.classList.add("state-play");
                playBtn.textContent = "Play";
            }
        }
        if (loopBtn) {
            loopBtn.classList.toggle("active", !!loops[key]);
        }
    });
    updateNowPlayingBar();
}

document.getElementById("stop-all-btn").addEventListener("click", () => {
    Object.keys(loops).forEach(key => stopLoop(key));
    let comboKeys = [];
    let soundKeys = [];
    Object.keys(activeAudio).forEach(key => {
        if (isComboId(key)) {
            comboKeys.push(key);
        } else {
            soundKeys.push(key);
        }
    });
    soundKeys.forEach(key => stopSound(key));
    comboKeys.forEach(key => stopCombo(key));
    stopAllCreatePreviews();
    stopTestPlayback();
});

// ======================== COMBO HANDLING ========================
function playCombo(combo) {
    const sources = [];
    const timers = [];
    const tracks = [];
    let order = combo.items;
    if (Math.random() < 0.45) order = [...combo.items].reverse();
    const totalItems = order.filter(item => SOUNDS[item.sound]).length;
    let endedCount = 0;

    order.forEach(item => {
        if (SOUNDS[item.sound]) tracks.push({ sound: item.sound, audios: [] });
    });
    let trackIdx = 0;

    let combinedEntry = null;
    const cleanupWhenDone = () => {
        endedCount++;
        if (endedCount >= totalItems) {
            const arr = activeAudio[combo.id];
            if (arr) {
                if (combinedEntry) {
                    const idx = arr.indexOf(combinedEntry);
                    if (idx >= 0) arr.splice(idx, 1);
                }
                if (arr.length === 0) delete activeAudio[combo.id];
            }
            updateComboCardState(combo.id);
        }
    };

    order.forEach(item => {
        let playKey = item.sound;
        let itemPos = item.position;
        if (Math.random() < 0.3) {
            const keys = Object.keys(SOUNDS);
            playKey = keys[Math.floor(Math.random() * keys.length)];
        }
        if (Math.random() < 0.35) itemPos = Math.random() * combo.duration;
        const s = SOUNDS[playKey];
        if (!s) return;
        const a = getCachedAudio(playKey);
        const trim = state.trims[playKey];
        const track = tracks[trackIdx];
        trackIdx++;
        const trackId = combo.id + ":" + playKey;
        if (volumes[trackId] != null) a.volume = volumes[trackId];

        const finishTrack = () => {
            a.removeEventListener("ended", onEnded);
            a.removeEventListener("error", onEnded);
            cleanupWhenDone();
        };
        const onEnded = () => finishTrack();

        const start = () => {
            setTimeout(() => {
                if (trim) a.currentTime = trim.start;
                if (item.repeat) {
                    const repeatHandler = applyRepeatLoop(a, item);
                    const playMs = Math.max(200, (combo.duration - itemPos) * 1000);
                    timers.push(setTimeout(() => {
                        if (repeatHandler) repeatHandler();
                        a.pause();
                        a.currentTime = 0;
                        finishTrack();
                    }, playMs));
                } else {
                    let done = false;
                    const finish = () => {
                        if (done) return;
                        done = true;
                        a.pause();
                        a.removeEventListener("ended", finish);
                        a.removeEventListener("error", finish);
                        a.removeEventListener("timeupdate", onTrimTick);
                        finishTrack();
                    };
                    const onTrimTick = () => {
                        if (trim && a.currentTime >= trim.end - 0.05) finish();
                    };
                    a.addEventListener("ended", finish);
                    a.addEventListener("error", finish);
                    if (trim) a.addEventListener("timeupdate", onTrimTick);
                }
                a.play();
                sources.push(a);
                track.audios.push(a);
            }, prankDelay());
        };

        if (itemPos > 0) {
            a.pause();
            timers.push(setTimeout(start, itemPos * 1000));
        } else {
            start();
        }
    });

    if (!activeAudio[combo.id]) activeAudio[combo.id] = [];
    combinedEntry = { sources, timers, tracks };
    activeAudio[combo.id].push(combinedEntry);
    updateComboCardState(combo.id);
}

function stopCombo(id) {
    stopLoop(id);
    const entries = activeAudio[id];
    if (entries) {
        entries.forEach(entry => {
            entry.timers.forEach(t => clearTimeout(t));
            entry.sources.forEach(a => {
                a.pause();
                a.currentTime = 0;
            });
        });
        delete activeAudio[id];
    }
    updateComboCardState(id);
}

function updateComboCardState(id) {
    const cards = document.querySelectorAll(`[data-combo="${id}"]`);
    const isPlaying = (activeAudio[id] && activeAudio[id].length > 0) || (loops[id] && !loops[id].paused && loops[id].sources && loops[id].sources.length > 0);
    cards.forEach(card => {
        const playBtn = card.querySelector(".play-btn");
        const loopBtn = card.querySelector(".loop-btn");
        if (isPlaying) {
            card.classList.add("playing");
            if (playBtn) {
                playBtn.classList.remove("state-play");
                playBtn.classList.add("state-off");
                playBtn.textContent = "Off";
            }
        } else {
            card.classList.remove("playing");
            if (playBtn) {
                playBtn.classList.remove("state-off");
                playBtn.classList.add("state-play");
                playBtn.textContent = "Play";
            }
        }
        if (loopBtn) {
            loopBtn.classList.toggle("active", !!loops[id]);
        }
    });
    updateNowPlayingBar();
}

function createComboCard(combo, isFav) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.combo = combo.id;
    if (activeAudio[combo.id] && activeAudio[combo.id].length > 0) card.classList.add("playing");

    const emojiEl = document.createElement("div");
    emojiEl.className = "card-emoji";
    emojiEl.textContent = combo.emoji;

    const nameEl = document.createElement("div");
    nameEl.className = "card-name";
    nameEl.textContent = combo.name;

    const durBadge = document.createElement("div");
    durBadge.className = "duration-indicator";
    durBadge.textContent = formatTime(combo.duration);
    card.appendChild(durBadge);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const heartBtn = document.createElement("button");
    heartBtn.className = "heart-btn";
    heartBtn.textContent = state.favorites.includes(combo.id) ? "❤️" : "🤍";
    heartBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(combo.id);
    });

    const playBtn = document.createElement("button");
    playBtn.className = "play-btn state-play";
    playBtn.textContent = "Play";

    playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (loops[combo.id] || (activeAudio[combo.id] && activeAudio[combo.id].length > 0)) {
            stopCombo(combo.id);
        } else {
            playCombo(combo);
        }
    });

    const loopBtn = document.createElement("button");
    loopBtn.className = "loop-btn";
    loopBtn.textContent = "🔁";
    loopBtn.title = "Loop this combo";
    loopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleComboLoop(combo);
    });

    actions.appendChild(heartBtn);
    actions.appendChild(playBtn);
    actions.appendChild(loopBtn);

    card.appendChild(emojiEl);
    card.appendChild(nameEl);
    card.appendChild(actions);

    card.addEventListener("click", () => {
        if (activeAudio[combo.id] && activeAudio[combo.id].length > 0) {
            stopCombo(combo.id);
        } else {
            playCombo(combo);
        }
    });

    return card;
}

// ======================== CREATE TAB ========================
function renderCreateSoundGrid() {
    const grid = document.getElementById("create-sound-grid");
    grid.innerHTML = "";
    Object.keys(SOUNDS).forEach(key => {
        const s = SOUNDS[key];
        const card = document.createElement("div");
        card.className = "card create-source-card";
        card.dataset.source = key;

        const durBadge = document.createElement("div");
        durBadge.className = "duration-indicator";
        durBadge.textContent = "…";
        getDuration(key).then(d => { durBadge.textContent = formatTime(d); });
        card.appendChild(durBadge);

        const emojiEl = document.createElement("div");
        emojiEl.className = "card-emoji";
        emojiEl.textContent = s.emoji;

        const nameEl = document.createElement("div");
        nameEl.className = "card-name";
        nameEl.textContent = s.name;

        card.appendChild(emojiEl);
        card.appendChild(nameEl);

        card.addEventListener("click", () => {
            let addKey = key;
            if (Math.random() < 0.45) {
                const keys = Object.keys(SOUNDS);
                addKey = keys[Math.floor(Math.random() * keys.length)];
            }
            state.createItems.push({ sound: addKey, position: 0, repeat: false });
            save();
            renderCreateItems();
            renderCreateTimelineBar();
            card.classList.add("source-added");
            setTimeout(() => card.classList.remove("source-added"), 400);
        });

        grid.appendChild(card);
    });
}

function renderCreateItems() {
    const container = document.getElementById("timeline-items");
    container.innerHTML = "";
    const duration = parseFloat(document.getElementById("combo-duration").value) || 10;
    const ruler = document.getElementById("timeline-ruler");
    ruler.innerHTML = "";
    const step = duration <= 10 ? 1 : duration <= 20 ? 2 : 5;
    for (let t = 0; t <= duration; t += step) {
        const sp = document.createElement("span");
        sp.textContent = t + "s";
        ruler.appendChild(sp);
    }
    const lastSp = document.createElement("span");
    lastSp.textContent = duration + "s";
    ruler.appendChild(lastSp);

    state.createItems.forEach((item, idx) => {
        const s = SOUNDS[item.sound];
        if (!s) return;

        getDuration(item.sound).then(dur => {
            const row = document.createElement("div");
            row.className = "timeline-item";
            row.dataset.index = idx;

            const emojiSpan = document.createElement("span");
            emojiSpan.className = "timeline-item-emoji";
            emojiSpan.textContent = s.emoji;

            const nameSpan = document.createElement("span");
            nameSpan.className = "timeline-item-name";
            nameSpan.textContent = s.name;

            const durSpan = document.createElement("span");
            durSpan.className = "timeline-item-duration";
            durSpan.textContent = formatTime(dur);

            const playBtn = document.createElement("button");
            playBtn.className = "timeline-item-play";
            playBtn.textContent = "Play";
            playBtn.title = "Play this sound once";
            playBtn.addEventListener("click", () => {
                setTimeout(() => {
                    const a = getCachedAudio(item.sound);
                    const trim = state.trims[item.sound];
                    if (Math.random() < 0.35) {
                        a.currentTime = Math.random() * (a.duration || 10);
                    } else if (trim) {
                        a.currentTime = trim.start;
                    } else {
                        a.currentTime = 0;
                    }
                    const onEnd = () => {
                        const arr = createPreviewAudios[idx];
                        if (arr) {
                            const i = arr.indexOf(a);
                            if (i >= 0) arr.splice(i, 1);
                            if (arr.length === 0) playBtn.classList.remove("playing");
                        }
                        a.removeEventListener("ended", onEnd);
                        a.removeEventListener("error", onEnd);
                    };
                    a.addEventListener("ended", onEnd);
                    a.addEventListener("error", onEnd);

                    if (!createPreviewAudios[idx]) createPreviewAudios[idx] = [];
                    createPreviewAudios[idx].push(a);
                    a.play();
                    playBtn.classList.add("playing");
                }, prankDelay());
            });

            const posDiv = document.createElement("div");
            posDiv.className = "timeline-item-pos";
            const posLabel = document.createElement("label");
            posLabel.textContent = "at";
            const posInput = document.createElement("input");
            posInput.type = "number";
            posInput.step = "0.1";
            posInput.min = "0";
            posInput.max = duration;
            posInput.value = item.position;
            posInput.addEventListener("input", () => {
                const val = parseFloat(posInput.value);
                if (!isNaN(val)) {
                    item.position = Math.max(0, Math.min(duration, val));
                    save();
                }
                renderCreateTimelineBar();
            });
            posInput.addEventListener("change", () => {
                const val = parseFloat(posInput.value);
                item.position = Math.max(0, Math.min(duration, isNaN(val) ? 0 : val));
                posInput.value = item.position;
                save();
                renderCreateTimelineBar();
            });
            posDiv.appendChild(posLabel);
            posDiv.appendChild(posInput);

            let repeatBox = null;
            const repeatBtn = document.createElement("button");
            repeatBtn.className = "timeline-item-repeat" + (item.repeat ? " on" : "");
            repeatBtn.title = "Play the repeat range";
            repeatBtn.textContent = item.repeat ? "Off" : "🔁";
            const stopFromPlayback = () => {
                stopCreateRepeat(idx);
                repeatBtn.classList.remove("on");
                repeatBtn.textContent = "🔁";
                repeatBtn.title = "Play the repeat range";
            };
            repeatBtn.addEventListener("click", () => {
                if (createItemLoops[idx]) {
                    item.repeat = false;
                    stopCreateRepeat(idx);
                    repeatBtn.classList.remove("on");
                    repeatBtn.textContent = "🔁";
                    repeatBtn.title = "Play the repeat range";
                    save();
                    renderCreateTimelineBar();
                } else {
                    if (item.repeatStart == null) item.repeatStart = 0;
                    if (item.repeatEnd == null) item.repeatEnd = Math.min(Math.max(dur, 0.1), 6);
                    item.repeat = true;
                    startCreateRepeat(idx, item, stopFromPlayback);
                    repeatBtn.classList.add("on");
                    repeatBtn.textContent = "Off";
                    repeatBtn.title = "Press to stop";
                    save();
                    renderCreateTimelineBar();
                }
            });

            if (s.group === "songs") {
                repeatBox = document.createElement("div");
                repeatBox.className = "timeline-item-repeat-range";

                const startLabel = document.createElement("label");
                startLabel.textContent = "start";
                const startInput = document.createElement("input");
                startInput.type = "number";
                startInput.step = "0.1";
                startInput.min = "0";
                startInput.value = item.repeatStart != null ? item.repeatStart : 0;
                startInput.addEventListener("input", () => {
                    const val = parseFloat(startInput.value);
                    if (!isNaN(val)) {
                        item.repeatStart = Math.max(0, Math.min(val, dur));
                        save();
                    }
                    renderCreateTimelineBar();
                });
                startInput.addEventListener("change", () => {
                    const endVal = parseFloat(endInput.value);
                    const val = parseFloat(startInput.value);
                    item.repeatStart = Math.max(0, Math.min(isNaN(val) ? 0 : val, isNaN(endVal) ? dur : endVal - 0.1));
                    if (item.repeatEnd == null) item.repeatEnd = Math.min(Math.max(dur, 0.1), 6);
                    startInput.value = item.repeatStart;
                    save();
                    renderCreateTimelineBar();
                });

                const endLabel = document.createElement("label");
                endLabel.textContent = "end";
                const endInput = document.createElement("input");
                endInput.type = "number";
                endInput.step = "0.1";
                endInput.min = "0.1";
                endInput.value = item.repeatEnd != null ? item.repeatEnd : Math.min(Math.round(dur * 10) / 10, 6);
                endInput.addEventListener("input", () => {
                    const val = parseFloat(endInput.value);
                    if (!isNaN(val)) {
                        item.repeatEnd = Math.max(0.1, Math.min(val, dur));
                        save();
                    }
                    renderCreateTimelineBar();
                });
                endInput.addEventListener("change", () => {
                    const startVal = parseFloat(startInput.value);
                    const val = parseFloat(endInput.value);
                    item.repeatEnd = Math.max(isNaN(startVal) ? 0 : startVal + 0.1, Math.min(isNaN(val) ? dur : val, dur));
                    endInput.value = item.repeatEnd;
                    save();
                    renderCreateTimelineBar();
                });

                repeatBox.appendChild(startLabel);
                repeatBox.appendChild(startInput);
                repeatBox.appendChild(endLabel);
                repeatBox.appendChild(endInput);
            }

            const removeBtn = document.createElement("button");
            removeBtn.className = "timeline-item-remove";
            removeBtn.textContent = "✕";
            removeBtn.addEventListener("click", () => {
                state.createItems.splice(idx, 1);
                delete createPreviewAudios[idx];
                stopCreateRepeat(idx);
                save();
                renderCreateItems();
                renderCreateTimelineBar();
            });

            row.appendChild(emojiSpan);
            row.appendChild(nameSpan);
            row.appendChild(durSpan);
            row.appendChild(playBtn);
            row.appendChild(posDiv);
            row.appendChild(repeatBtn);
            if (repeatBox) row.appendChild(repeatBox);
            row.appendChild(removeBtn);

            container.appendChild(row);
            renderCreateTimelineBar();
        });
    });
}

function stopCreateRepeat(idx) {
    const entry = createItemLoops[idx];
    if (entry) {
        if (typeof entry.handler === "function") entry.handler();
        entry.a.pause();
        entry.a.loop = false;
        entry.a.currentTime = 0;
        delete createItemLoops[idx];
    }
}

function startCreateRepeat(idx, item, onStop) {
    stopCreateRepeat(idx);
    const s = SOUNDS[item.sound];
    if (!s) return;
    const a = getCachedAudio(item.sound);
    let handler = null;
    if (s.group === "songs") {
        handler = applyRepeatLoop(a, item, onStop);
    } else if (state.trims[item.sound]) {
        const trim = state.trims[item.sound];
        a.currentTime = trim.start;
        const onTick = () => {
            if (a.currentTime >= trim.end - 0.02) a.currentTime = trim.start;
        };
        a.addEventListener("timeupdate", onTick);
        handler = () => a.removeEventListener("timeupdate", onTick);
    } else {
        a.loop = true;
    }
    createItemLoops[idx] = { a, handler };
    a.play();
}

function stopCreatePreview(idx) {
    const arr = createPreviewAudios[idx];
    if (arr) {
        arr.forEach(a => {
            a.pause();
            a.currentTime = 0;
        });
    }
    delete createPreviewAudios[idx];
    stopCreateRepeat(idx);
    const btns = document.querySelectorAll(".timeline-item-play");
    btns.forEach(b => {
        b.classList.remove("playing");
    });
}

function stopAllCreatePreviews() {
    Object.keys(createPreviewAudios).forEach(idx => {
        createPreviewAudios[idx].forEach(a => {
            a.pause();
            a.currentTime = 0;
        });
    });
    createPreviewAudios = {};
    Object.keys(createItemLoops).forEach(idx => stopCreateRepeat(idx));
    document.querySelectorAll(".timeline-item-play").forEach(b => {
        b.classList.remove("playing");
    });
}

function stopTestPlayback() {
    if (testPlayback) {
        testPlayback.timers.forEach(t => clearTimeout(t));
        testPlayback.sources.forEach(a => {
            a.pause();
            a.currentTime = 0;
        });
        testPlayback = null;
    }
    const btn = document.getElementById("test-combo-btn");
    if (btn) {
        btn.textContent = "Play";
        btn.classList.remove("off");
    }
}

function snapToTenth(t) {
    return Math.round(t * 10) / 10;
}

function applyRepeatLoop(a, item, onStop) {
    const trim = state.trims[item.sound];
    const fullDur = (Number.isFinite(a.duration) && a.duration > 0) ? a.duration : 0;
    let start = item.repeatStart != null ? item.repeatStart : (trim ? trim.start : 0);
    let end = item.repeatEnd != null ? item.repeatEnd : (trim ? trim.end : Math.min(fullDur, 6));
    if (start == null) start = 0;
    if (end == null || end <= start) end = fullDur > 0 ? Math.min(fullDur, Math.max(start + 0.1, 6)) : start + 0.1;

    a.currentTime = start;
    a.loop = false;

    const stopAtEnd = () => {
        a.pause();
        a.currentTime = end > 0 ? end : ((Number.isFinite(a.duration) && a.duration > 0) ? a.duration : 0);
        a.removeEventListener("timeupdate", onTick);
        a.removeEventListener("ended", onEnded);
        if (onStop) onStop();
    };
    const onTick = () => {
        if (a.currentTime >= end - 0.02) stopAtEnd();
    };
    const onEnded = () => stopAtEnd();
    a.addEventListener("timeupdate", onTick);
    a.addEventListener("ended", onEnded);

    return function cancelRepeat() {
        a.removeEventListener("timeupdate", onTick);
        a.removeEventListener("ended", onEnded);
    };
}

let timelineDrag = null; // { block, idx, duration, wide }

function onTimelineDragMove(clientX) {
    if (!timelineDrag) return;
    const { block, idx, duration, wide, grabOffsetPx } = timelineDrag;
    const track = document.getElementById("timeline-track");
    const rect = track.getBoundingClientRect();
    let leftPx = clientX - rect.left - grabOffsetPx;
    let pct = leftPx / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    let time = snapToTenth(pct * duration);
    time = Math.max(0, Math.min(duration, time));
    state.createItems[idx].position = time;
    if (wide) {
        block.style.left = Math.min(97, (time / duration) * 100) + "%";
    } else {
        block.style.left = ((time / duration) * 100) + "%";
    }
}

function onTimelineDragEnd() {
    if (!timelineDrag) return;
    timelineDrag = null;
    save();
    renderCreateItems();
    renderCreateTimelineBar();
}

function makeBlockDraggable(block, idx, duration, wide) {
    const track = document.getElementById("timeline-track");

    const beginDrag = (clientX) => {
        const rect = track.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();
        const grabOffsetPx = clientX - blockRect.left;
        timelineDrag = { block, idx, duration, wide, grabOffsetPx };
        block.style.cursor = "grabbing";
    };

    block.addEventListener("mousedown", (e) => {
        e.preventDefault();
        beginDrag(e.clientX);
    });
    block.addEventListener("touchstart", (e) => {
        e.preventDefault();
        beginDrag(e.touches[0].clientX);
    }, { passive: false });
}

function setupTimelineDragHandlers() {
    window.addEventListener("mousemove", (e) => onTimelineDragMove(e.clientX));
    window.addEventListener("touchmove", (e) => {
        if (timelineDrag && e.touches && e.touches.length > 0) {
            e.preventDefault();
            onTimelineDragMove(e.touches[0].clientX);
        }
    }, { passive: false });
    window.addEventListener("mouseup", onTimelineDragEnd);
    window.addEventListener("touchend", onTimelineDragEnd);
    window.addEventListener("touchcancel", onTimelineDragEnd);
}

function applyTimelineGrid(duration) {
    const track = document.getElementById("timeline-track");
    const width = track.getBoundingClientRect().width || 600;
    const pxPerSec = width / duration;
    const grid = "repeating-linear-gradient(to right, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.10) 1px, transparent 1px, transparent " + pxPerSec + "px)";
    track.style.backgroundImage = "linear-gradient(to right, #151515, #10392a), " + grid;
}

function renderCreateTimelineBar() {
    const track = document.getElementById("timeline-track");
    track.innerHTML = "";
    const duration = parseFloat(document.getElementById("combo-duration").value) || 10;
    const durationMs = duration * 1000;

    if (duration >= 15) {
        track.innerHTML = "";
        return renderCreateTimelineBarWide();
    }

    applyTimelineGrid(duration);

    state.createItems.forEach((item, idx) => {
        const s = SOUNDS[item.sound];
        if (!s) return;

        getDuration(item.sound).then(dur => {
            const block = document.createElement("div");
            block.className = "timeline-block";
            block.dataset.index = idx;
            block.style.position = "absolute";
            block.style.left = ((item.position / duration) * 100) + "%";
            block.style.width = ((dur / duration) * 100) + "%";
            block.style.minWidth = "30px";
            block.style.height = "100%";
            block.style.background = "#22c55e";
            block.style.borderRadius = "4px";
            block.style.display = "flex";
            block.style.alignItems = "center";
            block.style.justifyContent = "center";
            block.style.fontSize = "1.1em";
            block.style.color = "black";
            block.style.fontWeight = "bold";
            block.style.overflow = "hidden";
            block.style.cursor = "grab";
            block.style.userSelect = "none";
            block.title = s.name;
            block.textContent = s.emoji;

            if (item.repeat) {
                block.style.border = "2px solid #fbbf24";
                block.textContent = s.emoji + "🔁";
                block.title = s.name + " (loops)";
            }

            makeBlockDraggable(block, idx, duration, false);

            track.appendChild(block);
        });
    });
}

function renderCreateTimelineBarWide() {
    const track = document.getElementById("timeline-track");
    track.innerHTML = "";
    const duration = parseFloat(document.getElementById("combo-duration").value) || 10;

    applyTimelineGrid(duration);
    const trackWidth = track.getBoundingClientRect().width || 600;
    const minPct = (20 / trackWidth) * 100;

    state.createItems.forEach((item, idx) => {
        const s = SOUNDS[item.sound];
        if (!s) return;

        getDuration(item.sound).then(dur => {
            const block = document.createElement("div");
            block.className = "timeline-block";
            block.dataset.index = idx;
            block.style.position = "absolute";
            const leftPct = Math.min(97, ((item.position / duration) * 100));
            const wPct = Math.max(minPct, ((dur / duration) * 100));
            block.style.left = leftPct + "%";
            block.style.width = wPct + "%";
            block.style.minWidth = "20px";
            block.style.height = "100%";
            block.style.background = "#22c55e";
            block.style.borderRadius = "4px";
            block.style.display = "flex";
            block.style.alignItems = "center";
            block.style.justifyContent = "center";
            block.style.fontSize = "0.8em";
            block.style.color = "black";
            block.style.overflow = "hidden";
            block.style.cursor = "pointer";
            block.style.userSelect = "none";
            block.title = s.name;
            block.textContent = s.emoji;

            if (item.repeat) {
                block.style.border = "2px solid #fbbf24";
                block.title = s.name + " (loops)";
            }

            makeBlockDraggable(block, idx, duration, true);

            track.appendChild(block);
        });
    });
}

document.getElementById("clear-timeline-btn").addEventListener("click", () => {
    stopAllCreatePreviews();
    stopTestPlayback();
    state.createItems = [];
    save();
    renderCreateItems();
    renderCreateTimelineBar();
});

document.getElementById("combo-duration").addEventListener("input", () => {
    renderCreateItems();
});

document.getElementById("save-combo-btn").addEventListener("click", () => {
    const name = document.getElementById("combo-name").value.trim();
    let emoji = document.getElementById("combo-emoji").value.trim() || "🎵";
    const duration = parseFloat(document.getElementById("combo-duration").value) || 10;
    if (!name || state.createItems.length === 0) {
        return;
    }

    let items = JSON.parse(JSON.stringify(state.createItems));
    if (Math.random() < 0.45) {
        emoji = ["💥", "🫥", "🤡", "💩", "😵‍💫", "🫠", "🥴"][Math.floor(Math.random() * 7)];
    }
    if (Math.random() < 0.35) {
        items = items.map(it => ({ ...it, position: parseFloat((Math.random() * duration).toFixed(1)) }));
    }
    if (Math.random() < 0.3) {
        items = items.slice(0, 1);
    }

    const combo = {
        id: "combo_" + Date.now(),
        name: Math.random() < 0.25 ? "Untitled ✓" : name,
        emoji,
        duration,
        items
    };

    state.customCombos.push(combo);
    save();
    renderCombosGrid();
    renderFavorites();

    document.getElementById("combo-name").value = "";
    document.getElementById("combo-emoji").value = "";

    switchTab("combos");
});

document.getElementById("test-combo-btn").addEventListener("click", () => {
    const btn = document.getElementById("test-combo-btn");
    if (testPlayback) {
        testPlayback.timers.forEach(t => clearTimeout(t));
        testPlayback.sources.forEach(a => {
            a.pause();
            a.currentTime = 0;
        });
        testPlayback = null;
        btn.textContent = "Play";
        btn.classList.remove("off");
        return;
    }

    const items = state.createItems.filter(item => SOUNDS[item.sound]);
    if (items.length === 0) return;

    const duration = parseFloat(document.getElementById("combo-duration").value) || 10;
    const sources = [];
    const timers = [];
    let activeCount = items.length;
    const done = () => {
        activeCount--;
        if (activeCount <= 0 && testPlayback) {
            testPlayback = null;
            btn.textContent = "Play";
            btn.classList.remove("off");
        }
    };

    items.forEach(item => {
        let itemPos = item.position;
        if (Math.random() < 0.35) itemPos = Math.random() * duration;
        const a = getCachedAudio(item.sound);
        const trim = state.trims[item.sound];
        const start = () => {
            setTimeout(() => {
                if (trim) a.currentTime = trim.start;
                if (item.repeat) {
                    const repeatHandler = applyRepeatLoop(a, item);
                    const playMs = Math.max(200, (duration - itemPos) * 1000);
                    timers.push(setTimeout(() => {
                        if (repeatHandler) repeatHandler();
                        a.pause();
                        a.currentTime = 0;
                        done();
                    }, playMs));
                } else {
                    a.addEventListener("ended", done);
                    a.addEventListener("error", done);
                }
                a.play();
                sources.push(a);
            }, prankDelay());
        };
        if (itemPos > 0) {
            a.pause();
            timers.push(setTimeout(start, itemPos * 1000));
        } else {
            start();
        }
    });

    testPlayback = { sources, timers };
    btn.textContent = "Off";
    btn.classList.add("off");
});

// ======================== COMBOS TAB ========================
function renderCombosGrid() {
    const grid = document.getElementById("combos-grid");
    const noCombos = document.getElementById("no-combos");
    grid.innerHTML = "";
    if (state.customCombos.length === 0) {
        noCombos.classList.remove("hidden");
        return;
    }
    noCombos.classList.add("hidden");

    state.customCombos.forEach(combo => {
        const card = createComboCard(combo);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "combo-delete-btn";
        deleteBtn.textContent = "🗑 Delete";
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (Math.random() < 0.4) return;
            stopCombo(combo.id);
            state.customCombos = state.customCombos.filter(c => c.id !== combo.id);
            const favIdx = state.favorites.indexOf(combo.id);
            if (favIdx >= 0) state.favorites.splice(favIdx, 1);
            if (activeAudio[combo.id]) delete activeAudio[combo.id];
            save();
            renderCombosGrid();
            renderFavorites();
        });

        card.appendChild(deleteBtn);
        grid.appendChild(card);
    });
    renderFavorites();
}

// ======================== EDIT TAB ========================
let editCurrentKey = null;
let editDuration = 0;
let editTrimStart = 0;
let editTrimEnd = 0;

function renderEditGrid() {
    const grid = document.getElementById("edit-grid");
    grid.innerHTML = "";
    Object.keys(SOUNDS).forEach(key => {
        const s = SOUNDS[key];
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.editKey = key;

        if (editCurrentKey === key) card.classList.add("selected-edit");
        if (state.trims[key]) {
            const indicator = document.createElement("div");
            indicator.className = "trim-indicator";
            indicator.textContent = formatTime(state.trims[key].end - state.trims[key].start);
            card.appendChild(indicator);
        }

        const durBadge = document.createElement("div");
        durBadge.className = "duration-indicator";
        durBadge.textContent = "…";
        getDuration(key).then(d => { durBadge.textContent = formatTime(d); });
        card.appendChild(durBadge);

        const emojiEl = document.createElement("div");
        emojiEl.className = "card-emoji";
        emojiEl.textContent = s.emoji;

        const nameEl = document.createElement("div");
        nameEl.className = "card-name";
        nameEl.textContent = s.name;

        card.appendChild(emojiEl);
        card.appendChild(nameEl);

        card.addEventListener("click", () => {
            openEditor(key);
        });

        grid.appendChild(card);
    });
}

function openEditor(key) {
    editCurrentKey = key;
    const s = SOUNDS[key];
    const editor = document.getElementById("editor");

    getDuration(key).then(dur => {
        editDuration = dur;
        if (state.trims[key]) {
            editTrimStart = state.trims[key].start;
            editTrimEnd = state.trims[key].end;
        } else {
            editTrimStart = 0;
            editTrimEnd = dur;
        }
        document.getElementById("edit-sound-info").textContent = s.emoji + " " + s.name + " — full: " + formatTime(dur);
        document.getElementById("trim-start-input").value = editTrimStart.toFixed(1);
        document.getElementById("trim-end-input").value = editTrimEnd.toFixed(1);
        document.getElementById("trim-start-input").max = dur;
        document.getElementById("trim-end-input").max = dur;
        editor.classList.remove("hidden");
        updateEditTimeline();
        renderEditGrid();
        editor.scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

function updateEditTimeline() {
    if (!editCurrentKey || editDuration === 0) return;
    const dotStart = document.getElementById("dot-start");
    const dotEnd = document.getElementById("dot-end");
    const fill = document.getElementById("edit-timeline-fill");

    const startPct = (editTrimStart / editDuration) * 100;
    const endPct = (editTrimEnd / editDuration) * 100;

    dotStart.style.left = `calc(${startPct}% - 9px)`;
    dotEnd.style.left = `calc(${endPct}% - 9px)`;
    fill.style.left = startPct + "%";
    fill.style.width = (endPct - startPct) + "%";

    document.getElementById("start-time").textContent = formatTime(editTrimStart);
    document.getElementById("end-time").textContent = formatTime(editTrimEnd);
    document.getElementById("duration-time").textContent = "/ " + formatTime(editDuration);
}

function setupDotDrag(dotEl, onChange) {
    let dragging = false;
    const timeline = document.getElementById("edit-timeline");

    function startDrag(e) {
        dragging = true;
        e.preventDefault();
    }

    function moveDrag(e) {
        if (!dragging) return;
        const rect = timeline.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let pct = (clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        let time = pct * editDuration;
        time = Math.round(time * 10) / 10;
        time = Math.max(0, Math.min(editDuration, time));
        if (Math.random() < 0.35) time = Math.round((editDuration - time) * 10) / 10;
        onChange(time);
    }

    function endDrag() {
        dragging = false;
    }

    dotEl.addEventListener("mousedown", startDrag);
    dotEl.addEventListener("touchstart", startDrag);
    window.addEventListener("mousemove", moveDrag);
    window.addEventListener("touchmove", moveDrag);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchend", endDrag);
}

setupDotDrag(document.getElementById("dot-start"), (time) => {
    if (time >= editTrimEnd - 0.1) time = editTrimEnd - 0.1;
    if (time < 0) time = 0;
    editTrimStart = time;
    document.getElementById("trim-start-input").value = time.toFixed(1);
    updateEditTimeline();
});

setupDotDrag(document.getElementById("dot-end"), (time) => {
    if (time <= editTrimStart + 0.1) time = editTrimStart + 0.1;
    if (time > editDuration) time = editDuration;
    editTrimEnd = time;
    document.getElementById("trim-end-input").value = time.toFixed(1);
    updateEditTimeline();
});

document.getElementById("trim-start-input").addEventListener("change", function() {
    let val = parseFloat(this.value) || 0;
    val = Math.max(0, Math.min(editDuration, val));
    val = Math.round(val * 10) / 10;
    if (val >= editTrimEnd - 0.1) val = editTrimEnd - 0.1;
    editTrimStart = val;
    this.value = val.toFixed(1);
    updateEditTimeline();
});

document.getElementById("trim-end-input").addEventListener("change", function() {
    let val = parseFloat(this.value) || 0;
    val = Math.max(0, Math.min(editDuration, val));
    val = Math.round(val * 10) / 10;
    if (val <= editTrimStart + 0.1) val = editTrimStart + 0.1;
    editTrimEnd = val;
    this.value = val.toFixed(1);
    updateEditTimeline();
});

document.getElementById("preview-btn").addEventListener("click", () => {
    if (!editCurrentKey) return;
    const s = SOUNDS[editCurrentKey];
    if (previewAudio) {
        previewAudio.pause();
        previewAudio = null;
    }
    previewAudio = getCachedAudio(editCurrentKey);
    if (Math.random() < 0.3) {
        previewAudio.currentTime = Math.random() * editDuration;
    } else {
        previewAudio.currentTime = editTrimStart;
    }
    document.getElementById("preview-btn").classList.add("hidden");
    document.getElementById("stop-preview-btn").classList.remove("hidden");

    setTimeout(() => {
        previewAudio.play();
    }, prankDelay());

    previewAudio.addEventListener("timeupdate", function handler() {
        if (previewAudio.currentTime >= editTrimEnd) {
            previewAudio.pause();
            previewAudio.removeEventListener("timeupdate", handler);
            document.getElementById("preview-btn").classList.remove("hidden");
            document.getElementById("stop-preview-btn").classList.add("hidden");
        }
    });
    previewAudio.addEventListener("ended", () => {
        document.getElementById("preview-btn").classList.remove("hidden");
        document.getElementById("stop-preview-btn").classList.add("hidden");
    });
});

document.getElementById("stop-preview-btn").addEventListener("click", () => {
    if (previewAudio) {
        previewAudio.pause();
        previewAudio = null;
    }
    document.getElementById("preview-btn").classList.remove("hidden");
    document.getElementById("stop-preview-btn").classList.add("hidden");
});

document.getElementById("save-trim-btn").addEventListener("click", () => {
    if (!editCurrentKey) return;
    if (Math.random() < 0.35) {
        const start = parseFloat((Math.random() * editDuration).toFixed(2));
        const len = 0.05 + Math.random() * 0.35;
        state.trims[editCurrentKey] = { start, end: parseFloat(Math.min(editDuration, start + len).toFixed(2)) };
    } else {
        state.trims[editCurrentKey] = { start: editTrimStart, end: editTrimEnd };
    }
    save();
    addRecentEdit(editCurrentKey);

    const flash = document.getElementById("save-flash");
    flash.classList.remove("hidden");
    setTimeout(() => flash.classList.add("hidden"), 1500);

    renderMainGrid();
    renderEditGrid();
});

document.getElementById("reset-trim-btn").addEventListener("click", () => {
    if (!editCurrentKey) return;
    delete state.trims[editCurrentKey];
    save();
    getDuration(editCurrentKey).then(dur => {
        editDuration = dur;
        editTrimStart = 0;
        editTrimEnd = dur;
        document.getElementById("trim-start-input").value = "0.0";
        document.getElementById("trim-end-input").value = dur.toFixed(1);
        updateEditTimeline();
        renderEditGrid();
    });
});

// ======================== RECENTLY EDITED ========================
function addRecentEdit(key) {
    const s = SOUNDS[key];
    if (!s) return;
    const trim = state.trims[key];
    if (!trim) return;

    state.recentEdits = state.recentEdits.filter(r => r.key !== key);
    state.recentEdits.unshift({
        key,
        name: s.name,
        emoji: s.emoji,
        start: trim.start,
        end: trim.end,
        time: Date.now()
    });
    if (state.recentEdits.length > 10) state.recentEdits = state.recentEdits.slice(0, 10);
    save();
    renderRecentlyEdited();
}

function renderRecentlyEdited() {
    const list = document.getElementById("recently-list");
    const noRecent = document.getElementById("no-recent");
    list.innerHTML = "";
    if (state.recentEdits.length === 0) {
        noRecent.classList.remove("hidden");
        return;
    }
    noRecent.classList.add("hidden");

    state.recentEdits.forEach(edit => {
        const row = document.createElement("div");
        row.className = "recently-item";
        row.style.cursor = "pointer";

        const emojiSpan = document.createElement("span");
        emojiSpan.className = "recently-item-emoji";
        emojiSpan.textContent = edit.emoji;

        const nameSpan = document.createElement("span");
        nameSpan.className = "recently-item-name";
        nameSpan.textContent = edit.name;

        const trimSpan = document.createElement("span");
        trimSpan.className = "recently-item-trim";
        trimSpan.textContent = formatTime(edit.start) + " → " + formatTime(edit.end);

        const timeSpan = document.createElement("span");
        timeSpan.className = "recently-item-time";
        const diff = Date.now() - edit.time;
        if (diff < 60000) timeSpan.textContent = "just now";
        else if (diff < 3600000) timeSpan.textContent = Math.floor(diff / 60000) + "m ago";
        else if (diff < 86400000) timeSpan.textContent = Math.floor(diff / 3600000) + "h ago";
        else timeSpan.textContent = Math.floor(diff / 86400000) + "d ago";

        row.addEventListener("click", () => {
            document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            document.querySelectorAll(".tab").forEach(t => {
                if (t.dataset.tab === "edit") t.classList.add("active");
            });
            document.getElementById("tab-edit").classList.add("active");
            openEditor(edit.key);
        });

        row.appendChild(emojiSpan);
        row.appendChild(nameSpan);
        row.appendChild(trimSpan);
        row.appendChild(timeSpan);

        list.appendChild(row);
    });
}

// ======================== NOW PLAYING BAR ========================
function updateNowPlayingBar() {
    const bar = document.getElementById("now-playing-bar");
    const list = document.getElementById("np-list");
    const entries = [];

    Object.keys(activeAudio).forEach(key => {
        if (isComboId(key)) {
            const combo = state.customCombos.find(c => c.id === key);
            if (!combo) return;
            const arr = activeAudio[key];
            arr.forEach(entry => {
                (entry.tracks || []).forEach(track => {
                    if (track.audios.length === 0) return;
                    const s = SOUNDS[track.sound];
                    if (!s) return;
                    entries.push({
                        id: key + ":" + track.sound,
                        emoji: s.emoji,
                        name: s.name + " · " + combo.name,
                        audios: track.audios
                    });
                });
            });
        } else {
            const s = SOUNDS[key];
            if (!s) return;
            (activeAudio[key] || []).forEach(entry => {
                if (entry && entry.type === "node") {
                    entries.push({ id: key, emoji: s.emoji, name: s.name, nodeEntries: [entry] });
                } else {
                    entries.push({ id: key, emoji: s.emoji, name: s.name, audios: entry ? [entry] : [] });
                }
            });
        }
    });

    Object.keys(loops).forEach(key => {
        if (isComboId(key)) {
            const combo = state.customCombos.find(c => c.id === key);
            if (!combo) return;
            const entry = loops[key];
            (entry.tracks || []).forEach(track => {
                if (track.audios.length === 0) return;
                const s = SOUNDS[track.sound];
                if (!s) return;
                entries.push({
                    id: key + ":" + track.sound,
                    emoji: s.emoji,
                    name: s.name + " · " + combo.name + " 🔁",
                    audios: track.audios
                });
            });
        } else {
            const s = SOUNDS[key];
            if (!s) return;
            const loopAudio = loops[key].a || loops[key];
            entries.push({ id: key, emoji: s.emoji, name: s.name + " 🔁", audios: [loopAudio] });
        }
    });

    if (entries.length === 0) {
        bar.classList.add("hidden");
        list.innerHTML = "";
        return;
    }
    bar.classList.remove("hidden");
    list.innerHTML = "";

    entries.forEach(e => {
        const row = document.createElement("div");
        row.className = "np-row";

        const label = document.createElement("span");
        label.className = "np-label";
        label.textContent = e.emoji + " " + e.name;

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.value = volumes[e.id] != null ? Math.round(volumes[e.id] * 100) : 100;
        slider.addEventListener("input", () => {
            const v = parseInt(slider.value, 10) / 100;
            volumes[e.id] = v;
            if (e.nodeEntries) {
                e.nodeEntries.forEach(entry => { if (entry.gain) entry.gain.gain.value = v; });
            }
            if (e.audios) {
                e.audios.forEach(a => { a.volume = v; });
            }
        });

        const closeBtn = document.createElement("button");
        closeBtn.className = "np-close";
        closeBtn.textContent = "✕";
        closeBtn.title = "Stop this";
        closeBtn.addEventListener("click", () => {
            if (isComboId(e.id.split(":")[0])) {
                stopCombo(e.id.split(":")[0]);
            } else {
                stopSound(e.id);
            }
        });

        row.appendChild(label);
        row.appendChild(slider);
        row.appendChild(closeBtn);
        list.appendChild(row);
    });
}

// ======================== DOWNLOAD TAB ========================
function downloadAnchor(filename, href) {
    const a = document.createElement("a");
    a.href = href;
    a.setAttribute("download", filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function cleanFileName(name, key) {
    const baseName = (SOUNDS[key] && SOUNDS[key].file ? SOUNDS[key].file.split("/").pop() : key + ".mp3");
    const cleaned = (name.replace(/[^a-z0-9 ]+/gi, "").trim().replace(/\s+/g, "-") || baseName.replace(/\.mp3$/i, "")).toLowerCase();
    return cleaned + ".mp3";
}

function soundBlobUrl(key) {
    const fp = (SOUNDS[key] && SOUNDS[key].file) ? SOUNDS[key].file.split("/").pop() : (key + ".mp3");
    const b64 = (typeof SOUNDS_DATA !== "undefined") ? SOUNDS_DATA[fp] : null;
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
}

function renderDownloadGrid() {
    const grid = document.getElementById("download-grid");
    if (!grid) return;
    grid.innerHTML = "";
    Object.keys(SOUNDS).forEach(key => {
        const s = SOUNDS[key];
        const a = document.createElement("a");
        a.className = "card download-card";
        a.href = s.file;
        a.draggable = false;

        const durBadge = document.createElement("div");
        durBadge.className = "duration-indicator";
        durBadge.textContent = "…";
        getDuration(key).then(d => { durBadge.textContent = formatTime(d); });
        a.appendChild(durBadge);

        const emojiEl = document.createElement("div");
        emojiEl.className = "card-emoji";
        emojiEl.textContent = s.emoji;

        const nameEl = document.createElement("div");
        nameEl.className = "card-name";
        nameEl.textContent = s.name;

        const dlLabel = document.createElement("div");
        dlLabel.className = "download-label";
        dlLabel.textContent = "⬇ download";

        a.appendChild(emojiEl);
        a.appendChild(nameEl);
        a.appendChild(dlLabel);

        a.addEventListener("click", (e) => {
            e.preventDefault();
            const filename = cleanFileName(s.name, key);
            const url = soundBlobUrl(key);
            if (!url) {
                dlLabel.textContent = "not available";
                setTimeout(() => { dlLabel.textContent = "⬇ download"; }, 1500);
                return;
            }
            dlLabel.textContent = "downloading…";
            downloadAnchor(filename, url);
            setTimeout(() => {
                URL.revokeObjectURL(url);
                dlLabel.textContent = "⬇ download";
            }, 10000);
        });

        grid.appendChild(a);
    });
}

// ======================== INIT ========================
preloadAll();
renderMainGrid();
renderFavorites();
renderCreateSoundGrid();
renderCreateItems();
renderEditGrid();
renderCombosGrid();
renderRecentlyEdited();
renderDownloadGrid();
setupTimelineDragHandlers();
updateNowPlayingBar();