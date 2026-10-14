(function () {
  var codeScreen = document.getElementById("code-screen");
  var scanScreen = document.getElementById("scan-screen");
  var codeInput = document.getElementById("code");
  var statusNode = document.getElementById("status");
  var video = document.getElementById("video");
  var guide = document.getElementById("guide");
  var torchButton = document.getElementById("torch");
  var againButton = document.getElementById("again");
  var preview = document.getElementById("preview");
  var resultNode = document.getElementById("result");
  var worker = null;
  var stream = null;
  var scanning = false;
  var busy = false;
  var torchOn = false;
  var misses = 0;

  document.getElementById("enter").addEventListener("click", enter);
  codeInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") enter();
  });
  torchButton.addEventListener("click", toggleTorch);
  againButton.addEventListener("click", function () {
    resultNode.hidden = true;
    againButton.hidden = true;
    startScan();
  });

  if (!window.isSecureContext || !navigator.mediaDevices) {
    document.getElementById("code-error").textContent =
      "Apri l'indirizzo https:// mostrato sul PC. Su una pagina non sicura la camera non si accende.";
  }

  var saved = sessionStorage.getItem("banco-mrz-code");
  if (saved && saved.length === 4) {
    codeInput.value = saved;
  }

  function enter() {
    var code = codeInput.value.replace(/\D/g, "");
    if (code.length !== 4) {
      document.getElementById("code-error").textContent = "Il codice è di 4 cifre.";
      return;
    }
    sessionStorage.setItem("banco-mrz-code", code);
    codeScreen.hidden = true;
    scanScreen.hidden = false;
    startScan();
  }

  async function startScan() {
    setStatus("Avvio la camera…");
    try {
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        video.srcObject = stream;
        await video.play();
        var track = stream.getVideoTracks()[0];
        var caps = track.getCapabilities ? track.getCapabilities() : {};
        torchButton.hidden = !caps.torch;
        if (navigator.wakeLock) {
          navigator.wakeLock.request("screen").catch(function () {});
        }
      }
      if (!worker) {
        setStatus("Preparo il lettore, la prima volta ci mette un po'…");
        worker = await Tesseract.createWorker("eng", 1, {
          workerPath: "/vendor/tesseract/worker.min.js",
          corePath: "/vendor/tesseract/core",
          langPath: "/vendor/tessdata",
        });
        await worker.setParameters({
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
          tessedit_pageseg_mode: "6",
          user_defined_dpi: "300",
        });
      }
      scanning = true;
      misses = 0;
      setStatus("Tieni le righe dentro la fascia gialla.");
      loop();
    } catch (error) {
      setStatus(cameraMessage(error));
    }
  }

  function cameraMessage(error) {
    var name = error && error.name;
    if (name === "NotAllowedError") return "Permesso della camera negato. Abilitalo nelle impostazioni del browser.";
    if (name === "NotFoundError") return "Questo telefono non ha una camera utilizzabile.";
    if (!window.isSecureContext) return "La camera resta spenta finché non apri l'indirizzo https del PC.";
    return "Camera non avviata. " + (error && error.message ? error.message : "");
  }

  async function loop() {
    if (!scanning || busy) return;
    busy = true;
    try {
      var shot = crop();
      if (shot) {
        preview.hidden = false;
        var ctx = preview.getContext("2d");
        preview.width = shot.width;
        preview.height = shot.height;
        ctx.drawImage(shot, 0, 0);
        var recognized = await worker.recognize(shot);
        var parsed = MRZ.parse(recognized.data.text);
        if (parsed) {
          scanning = false;
          busy = false;
          await deliver(parsed);
          return;
        }
        misses += 1;
        if (misses === 6) setStatus("Avvicina la carta, evita il riflesso, tieni ferme le righe.");
      }
    } catch (error) {
      setStatus("Lettura interrotta. " + (error.message || ""));
      scanning = false;
    }
    busy = false;
    if (scanning) window.setTimeout(loop, 150);
  }

  function crop() {
    if (!video.videoWidth) return null;
    var rect = sourceRect(video, guide);
    if (!rect) return null;
    var destW = 1400;
    var destH = Math.max(90, Math.round(destW * (rect.sh / rect.sw)));
    var canvas = document.createElement("canvas");
    canvas.width = destW;
    canvas.height = destH;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, destW, destH);
    var image = ctx.getImageData(0, 0, destW, destH);
    var data = image.data;
    for (var i = 0; i < data.length; i += 4) {
      var y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      y = (y - 128) * 1.8 + 128;
      y = Math.max(0, Math.min(255, y));
      data[i] = data[i + 1] = data[i + 2] = y;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function sourceRect(videoEl, guideEl) {
    var vr = videoEl.getBoundingClientRect();
    var gr = guideEl.getBoundingClientRect();
    var vw = videoEl.videoWidth;
    var vh = videoEl.videoHeight;
    var elemRatio = vr.width / vr.height;
    var videoRatio = vw / vh;
    var drawW;
    var drawH;
    var offX;
    var offY;
    if (elemRatio > videoRatio) {
      drawH = vr.height;
      drawW = vr.height * videoRatio;
      offX = (vr.width - drawW) / 2;
      offY = 0;
    } else {
      drawW = vr.width;
      drawH = vr.width / videoRatio;
      offX = 0;
      offY = (vr.height - drawH) / 2;
    }
    var x = (gr.left - vr.left - offX) / drawW;
    var y = (gr.top - vr.top - offY) / drawH;
    var w = gr.width / drawW;
    var h = gr.height / drawH;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > 1) w = 1 - x;
    if (y + h > 1) h = 1 - y;
    if (w < 0.05 || h < 0.02) return null;
    return {
      sx: Math.round(x * vw),
      sy: Math.round(y * vh),
      sw: Math.max(1, Math.round(w * vw)),
      sh: Math.max(1, Math.round(h * vh)),
    };
  }

  async function deliver(parsed) {
    setStatus("Righe lette. Le mando al PC…");
    stopCamera();
    showResult(parsed, "");
    try {
      var response = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: sessionStorage.getItem("banco-mrz-code"),
          lines: parsed.lines,
        }),
      });
      var body = await response.json();
      if (!response.ok) {
        if (response.status === 403) sessionStorage.removeItem("banco-mrz-code");
        showResult(parsed, body.errore || "Il PC non ha accettato le righe.");
        return;
      }
      showResult(parsed, "Il PC ha le righe. Lì premi Copia, poi nel gestionale Incolla dagli appunti.");
      againButton.hidden = false;
    } catch (error) {
      showResult(parsed, "Il PC non è raggiungibile. Le righe sono qui sotto: copiale a mano.");
    }
  }

  function showResult(parsed, message) {
    var sex = parsed.sex === "M" ? "M" : parsed.sex === "F" ? "F" : "non indicato";
    resultNode.hidden = false;
    resultNode.innerHTML =
      "<p class='" + (message.indexOf("PC ha") === 0 ? "ok" : "warn") + "'>" + escapeHtml(message) + "</p>" +
      "<div class='fields'>" +
      field("Documento", parsed.kind) +
      field("Cognome", parsed.surname) +
      field("Nome", parsed.givenNames) +
      field("Nascita", parsed.birthDate) +
      field("Sesso", sex) +
      field("Scadenza", parsed.expiryDate) +
      field("Cittadinanza", parsed.nationality) +
      field("Numero", parsed.documentNumber) +
      "</div>" +
      "<textarea readonly>" + escapeHtml(parsed.lines.join("\n")) + "</textarea>";
    againButton.hidden = false;
  }

  function field(label, value) {
    return "<div><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(value || "") + "</strong></div>";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char];
    });
  }

  function stopCamera() {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
      video.srcObject = null;
    }
  }

  async function toggleTorch() {
    if (!stream) return;
    torchOn = !torchOn;
    try {
      await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: torchOn }] });
      torchButton.textContent = torchOn ? "Spegni la luce" : "Accendi la luce";
    } catch (error) {
      torchOn = false;
    }
  }

  function setStatus(text) {
    statusNode.textContent = text;
  }
})();
