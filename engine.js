// SBG Route 2 — Hudson Taylor Amazing Race — shared app engine
// Expects window.TEAM_CONFIG = { name: "2A", sequence: ["CP1","CP2",...] }
// and window.CP_DATA / window.PASSAGE_DATA to already be loaded.
(function () {
  "use strict";

  var CFG = window.TEAM_CONFIG;
  var CP = window.CP_DATA;
  var PASSAGE = window.PASSAGE_DATA;
  var STORE_KEY = "sbg_route2_team_" + CFG.name;
  var app = document.getElementById("app");

  function normalize(s) {
    return (s || "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function freshState() {
    var status = {};
    CFG.sequence.forEach(function (id) { status[id] = "pending"; });
    return {
      pointer: 0,               // index into CFG.sequence for the active checkpoint screen
      maxReached: 0,             // furthest index the team has legitimately reached
      status: status,           // pending | solved | skipped | done (done = no-keyword task finished)
      keywords: {},             // cpId -> collected keyword (lowercase)
      screen: "checkpoint",     // checkpoint | summary | passage | congrats
      passageAnswers: {}
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return freshState();
      var parsed = JSON.parse(raw);
      // basic shape guard in case sequence/config changed
      if (!parsed || !parsed.status) return freshState();
      if (typeof parsed.maxReached !== "number") parsed.maxReached = parsed.pointer || 0;
      if (!parsed.passageAnswers) parsed.passageAnswers = {};
      return parsed;
    } catch (e) {
      return freshState();
    }
  }

  var state = loadState();

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function allKeywordCheckpointsSolved() {
    return CFG.sequence.every(function (id) {
      var cp = CP[id];
      if (!cp.contributesKeyword) return state.status[id] !== "pending";
      return state.status[id] === "solved";
    });
  }

  function stepsDoneCount() {
    var kwSteps = CFG.sequence.filter(function (id) { return CP[id].contributesKeyword; });
    var solved = kwSteps.filter(function (id) { return state.status[id] === "solved"; });
    return { solved: solved.length, total: kwSteps.length };
  }

  function esc(s) {
    return (s || "").toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function progressBar(activeIdx) {
    var html = '<div class="progress">';
    CFG.sequence.forEach(function (id, i) {
      var cls = "seg";
      var st = state.status[id];
      if (i === activeIdx) cls += " current";
      else if (st === "solved" || st === "done") cls += " done";
      else if (st === "skipped") cls += " skipped";
      html += '<div class="' + cls + '"></div>';
    });
    html += "</div>";
    return html;
  }

  function goTo(idx) {
    if (idx < 0) idx = 0;
    // guard against jumping ahead of stations the team hasn't legitimately reached yet
    if (idx > state.maxReached) idx = state.maxReached;
    if (idx >= CFG.sequence.length) {
      state.screen = "summary";
    } else {
      state.pointer = idx;
      state.screen = "checkpoint";
    }
    save();
    render();
  }

  function openLightbox(src) {
    var lb = document.getElementById("lightbox");
    var img = document.getElementById("lightbox-img");
    img.src = src;
    lb.classList.add("show");
  }

  window.closeLightbox = function () {
    document.getElementById("lightbox").classList.remove("show");
  };

  // ---------- Checkpoint screen ----------
  function renderCheckpoint() {
    var idx = state.pointer;
    var id = CFG.sequence[idx];
    var cp = CP[id];
    var st = state.status[id];
    var stepNum = idx + 1;
    var total = CFG.sequence.length;

    var backDisabled = idx === 0 ? "disabled" : "";

    var badge = "";
    if (st === "solved" || st === "done") badge = '<span class="badge solved">✔ Completed</span>';
    else if (st === "skipped") badge = '<span class="badge skipped">⏭ Skipped — come back to finish</span>';

    function zoomImg(src, caption) {
      if (!src) return "";
      return '<img class="photo zoomable" data-full="' + esc(src) + '" src="' + esc(src) + '" alt="' + esc(caption || "photo") + '">' +
        (caption ? '<div class="photocaption">' + esc(caption) + "</div>" : "");
    }

    var mapHtml = cp.mapImg
      ? '<div class="section-label">Location Map</div>' + zoomImg(cp.mapImg, cp.mapCaption || "Checkpoint location marked in red.")
      : "";

    var pathHtml = "";
    if (cp.pathImgs && cp.pathImgs.length) {
      pathHtml = '<div class="section-label">On the way</div>';
      cp.pathImgs.forEach(function (p) { pathHtml += zoomImg(p.src, p.caption); });
    }

    var boardHtml = "";
    if (cp.board) {
      boardHtml = '<div class="section-label">Board / Marker</div><p>' + esc(cp.board) + "</p>" + zoomImg(cp.boardImg, cp.boardCaption);
    } else if (cp.boardImg) {
      boardHtml = '<div class="section-label">Photo</div>' + zoomImg(cp.boardImg, cp.boardCaption);
    }

    var patternHtml = cp.pattern
      ? '<div class="patternbox">' + esc(cp.pattern) + "</div>"
      : "";

    var bodyInner = "";

    if (!cp.contributesKeyword) {
      // CP5-style: task-only checkpoint, no keyword to type in
      bodyInner =
        '<div class="section-label">Task</div><p>' + esc(cp.hint) + "</p>" +
        '<button class="btn btn-primary" id="doneBtn">' + (st === "done" ? "Continue" : "We’ve completed this ✔ Continue") + "</button>";
    } else if (st === "solved") {
      bodyInner =
        '<div class="hintbox">✅ Solved! Your keyword: <strong>' + esc((state.keywords[id] || "").toUpperCase()) + "</strong></div>" +
        '<button class="btn btn-primary" id="nextBtn">Continue</button>';
    } else {
      var noteIfSkippedBefore = st === "skipped" ? '<div class="badge skipped">You skipped this earlier — solve it now!</div>' : "";
      bodyInner =
        noteIfSkippedBefore +
        '<div class="section-label">Where the hidden word is</div>' +
        '<div class="hintbox">' + esc(cp.hint) + "</div>" +
        patternHtml +
        '<input type="text" id="answerInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the keyword here">' +
        '<div class="msg" id="msgBox"></div>' +
        '<button class="btn btn-primary" id="submitBtn">Submit answer</button>' +
        (st === "skipped" ? "" : '<button class="btn-skip" id="skipBtn">Can’t find it? Skip to next station ›</button>');
    }

    var whatsappNote = cp.whatsapp
      ? '<div class="hintbox">📱 WhatsApp your photo to <strong>' + esc(cp.whatsappNumber || "") + '</strong>' + (cp.contributesKeyword ? " to receive this checkpoint's keyword." : ".") + "</div>"
      : "";

    app.innerHTML =
      '<div class="topbar">' +
      '<button class="btn-back" id="backBtn" ' + backDisabled + '>‹ Back</button>' +
      '<button class="steplink" id="summaryLink">My progress</button>' +
      "</div>" +
      progressBar(idx) +
      '<div class="steplabel">Station ' + stepNum + " of " + total + "</div>" +
      badge +
      "<h1>" + esc(cp.title) + "</h1>" +
      (cp.subtitle ? '<div class="subtitle">' + esc(cp.subtitle) + "</div>" : "") +
      mapHtml +
      '<div class="section-label">Directions</div>' +
      "<p>" + esc(cp.directions) + "</p>" +
      pathHtml +
      boardHtml +
      whatsappNote +
      bodyInner;

    Array.prototype.forEach.call(document.querySelectorAll(".zoomable"), function (imgEl) {
      imgEl.onclick = function () { openLightbox(imgEl.getAttribute("data-full")); };
    });

    var backBtn = document.getElementById("backBtn");
    if (backBtn) backBtn.onclick = function () { goTo(idx - 1); };

    var summaryLink = document.getElementById("summaryLink");
    if (summaryLink) summaryLink.onclick = function () { state.screen = "summary"; save(); render(); };

    var doneBtn = document.getElementById("doneBtn");
    if (doneBtn) doneBtn.onclick = function () {
      state.status[id] = "done";
      save();
      advance(idx);
    };

    var nextBtn = document.getElementById("nextBtn");
    if (nextBtn) nextBtn.onclick = function () { advance(idx); };

    var submitBtn = document.getElementById("submitBtn");
    var input = document.getElementById("answerInput");
    var msgBox = document.getElementById("msgBox");

    if (submitBtn) {
      var doSubmit = function () {
        var val = input.value;
        if (normalize(val) === normalize(cp.answer)) {
          state.status[id] = "solved";
          state.keywords[id] = normalize(val) === "" ? cp.answer : val.trim();
          save();
          msgBox.className = "msg ok show";
          msgBox.textContent = "✅ Correct! Well done.";
          submitBtn.disabled = true;
          setTimeout(function () { advance(idx); }, 800);
        } else {
          msgBox.className = "msg bad show";
          msgBox.textContent = "Not quite — check the board again and try once more.";
          input.classList.add("shake");
          setTimeout(function () { input.classList.remove("shake"); }, 350);
        }
      };
      submitBtn.onclick = doSubmit;
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") doSubmit();
      });
    }

    var skipBtn = document.getElementById("skipBtn");
    if (skipBtn) skipBtn.onclick = function () {
      state.status[id] = "skipped";
      save();
      advance(idx);
    };
  }

  function advance(fromIdx) {
    var nextIdx = fromIdx + 1;
    if (nextIdx > state.maxReached) state.maxReached = nextIdx;
    if (nextIdx >= CFG.sequence.length) {
      state.screen = "summary";
    } else {
      state.pointer = nextIdx;
      state.screen = "checkpoint";
    }
    save();
    render();
  }

  // ---------- Summary screen ----------
  function renderSummary() {
    var done = stepsDoneCount();
    var allDone = allKeywordCheckpointsSolved();

    var listHtml = '<div class="jumplist">';
    CFG.sequence.forEach(function (id, i) {
      var cp = CP[id];
      var st = state.status[id];
      var reachable = i <= state.maxReached;
      var tag = "";
      if (st === "solved") tag = '<span class="tag done">Solved</span>';
      else if (st === "done") tag = '<span class="tag done">Done</span>';
      else if (st === "skipped") tag = '<span class="tag">Skipped</span>';
      else tag = '<span class="tag">' + (reachable ? "Not visited" : "Locked") + "</span>";
      listHtml +=
        '<div class="jumpitem' + (reachable ? "" : " locked") + '" data-idx="' + i + '"' + (reachable ? "" : ' data-locked="1"') + '>' +
        "<span>" + (i + 1) + ". " + esc(cp.title.replace(/^Checkpoint \d+ — /, "")) + "</span>" +
        '<span>' + tag + (reachable ? ' <span class="arrow">›</span>' : "") + "</span>" +
        "</div>";
    });
    listHtml += "</div>";

    var ctaHtml;
    if (allDone) {
      ctaHtml = '<div class="hintbox">🎉 All checkpoints complete! You can now attempt the Final Challenge.</div>' +
        '<button class="btn btn-primary" id="finalBtn">Go to Final Challenge ›</button>';
    } else {
      ctaHtml = '<div class="hintbox">' + done.solved + " of " + done.total + " keyword checkpoints solved. Tap a skipped station below to go back and complete it — the Final Challenge unlocks once every checkpoint is done.</div>";
    }

    app.innerHTML =
      '<div class="topbar">' +
      '<button class="btn-back" id="backBtn">‹ Back</button>' +
      "<div></div>" +
      "</div>" +
      "<h1>Your Progress</h1>" +
      '<div class="subtitle">Team ' + esc(CFG.name) + "</div>" +
      listHtml +
      ctaHtml +
      '<div class="footerlink"><a class="textlink" id="resetLink" href="#">Facilitator: reset this team’s progress</a></div>';

    document.getElementById("backBtn").onclick = function () {
      goTo(Math.min(state.pointer, CFG.sequence.length - 1));
    };

    document.getElementById("resetLink").onclick = function (e) {
      e.preventDefault();
      if (window.confirm("Reset all progress for Team " + CFG.name + "? This cannot be undone.")) {
        localStorage.removeItem(STORE_KEY);
        state = freshState();
        render();
      }
    };

    Array.prototype.forEach.call(document.querySelectorAll(".jumpitem"), function (el) {
      if (el.getAttribute("data-locked")) return;
      el.onclick = function () { goTo(parseInt(el.getAttribute("data-idx"), 10)); };
    });

    var finalBtn = document.getElementById("finalBtn");
    if (finalBtn) finalBtn.onclick = function () {
      state.screen = "passage";
      save();
      render();
    };
  }

  // ---------- Final passage screen ----------
  function collectedWords() {
    var words = [];
    CFG.sequence.forEach(function (id) {
      var cp = CP[id];
      if (cp.contributesKeyword && state.keywords[id]) words.push(state.keywords[id]);
    });
    // shuffle deterministically-ish
    return words
      .map(function (w) { return [Math.random(), w]; })
      .sort(function (a, b) { return a[0] - b[0]; })
      .map(function (p) { return p[1]; });
  }

  function renderPassage() {
    if (!allKeywordCheckpointsSolved()) {
      // safety guard: shouldn't happen via normal nav, but bounce back if it does
      state.screen = "summary";
      save();
      render();
      return;
    }

    var html = '<div class="passage">';
    PASSAGE.parts.forEach(function (part) {
      if (typeof part === "string") {
        html += esc(part).replace(/\n/g, "<br>");
      } else {
        var val = state.passageAnswers[part.blank] || "";
        html += '<input class="blank" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" data-blank="' + part.blank + '" value="' + esc(val) + '" placeholder="' + part.blank + '">';
      }
    });
    html += "</div>";

    var bank = collectedWords();
    var bankHtml = '<div class="wordbank"><div class="section-label">Word bank — use each once</div><div class="chip-row">' +
      bank.map(function (w) { return '<span class="chip">' + esc(w.toUpperCase()) + "</span>"; }).join("") +
      "</div></div>";

    app.innerHTML =
      '<div class="topbar">' +
      '<button class="btn-back" id="backBtn">‹ Back</button>' +
      "<div></div>" +
      "</div>" +
      "<h1>Final Challenge</h1>" +
      '<div class="subtitle">Fill in the Quest Passage</div>' +
      "<p>Use the keywords you collected at each checkpoint to complete the passage below.</p>" +
      html +
      '<div class="msg" id="msgBox"></div>' +
      '<button class="btn btn-primary" id="checkBtn">Check answers</button>' +
      bankHtml;

    document.getElementById("backBtn").onclick = function () {
      state.screen = "summary";
      save();
      render();
    };

    Array.prototype.forEach.call(document.querySelectorAll(".blank"), function (inp) {
      inp.addEventListener("input", function () {
        state.passageAnswers[inp.getAttribute("data-blank")] = inp.value;
        save();
      });
    });

    document.getElementById("checkBtn").onclick = function () {
      var allCorrect = true;
      Array.prototype.forEach.call(document.querySelectorAll(".blank"), function (inp) {
        var blankNum = inp.getAttribute("data-blank");
        var part = PASSAGE.parts.find(function (p) { return typeof p === "object" && String(p.blank) === String(blankNum); });
        var correctWord = CP[part.cp].answer;
        var ok = normalize(inp.value) === normalize(correctWord);
        inp.classList.remove("correct", "incorrect");
        inp.classList.add(ok ? "correct" : "incorrect");
        if (!ok) allCorrect = false;
      });
      var msgBox = document.getElementById("msgBox");
      if (allCorrect) {
        msgBox.className = "msg ok show";
        msgBox.textContent = "🎉 All correct! Redirecting…";
        state.screen = "congrats";
        save();
        setTimeout(render, 900);
      } else {
        msgBox.className = "msg bad show";
        msgBox.textContent = "Some words aren't quite right yet — check the highlighted boxes and the word bank.";
      }
    };
  }

  // ---------- Congrats screen ----------
  function launchConfetti() {
    var colors = ["#1f6f4a", "#d9a441", "#3f9c6d", "#fbf7ec"];
    for (var i = 0; i < 40; i++) {
      (function () {
        var el = document.createElement("div");
        el.className = "confetti";
        el.style.left = Math.random() * 100 + "vw";
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.animationDuration = 2.2 + Math.random() * 1.8 + "s";
        el.style.animationDelay = Math.random() * 0.6 + "s";
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 4500);
      })();
    }
  }

  function renderCongrats() {
    app.innerHTML =
      '<div class="bigemoji">🎉🌿🎉</div>' +
      '<h1 class="center">Congratulations, Team ' + esc(CFG.name) + "!</h1>" +
      '<p class="center">You’ve completed the Great Commission Quest and solved the full Hudson Taylor passage.</p>' +
      '<div class="hintbox center">Please make your way back to the gathering point now. Well done, team! 🙌</div>' +
      '<div class="footerlink"><a class="textlink" href="index.html">Amazing Race home</a></div>';
    launchConfetti();
  }

  function render() {
    if (state.screen === "summary") renderSummary();
    else if (state.screen === "passage") renderPassage();
    else if (state.screen === "congrats") renderCongrats();
    else renderCheckpoint();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".lightbox").forEach(function (lb) {
      lb.addEventListener("click", function () { window.closeLightbox(); });
    });
    render();
  });
})();
