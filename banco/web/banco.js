(function () {
  var shown = 0;
  var urlNode = document.getElementById("phone-url");
  var codeNode = document.getElementById("desk-code");
  var waitNode = document.getElementById("wait");
  var fieldsNode = document.getElementById("fields");
  var linesNode = document.getElementById("lines");
  var copyButton = document.getElementById("copy");
  var hintNode = document.getElementById("hint");

  document.getElementById("copy").addEventListener("click", copyLines);
  document.getElementById("clear").addEventListener("click", clearDesk);

  loadConfig();
  window.setInterval(poll, 500);

  async function loadConfig() {
    var response = await fetch("/api/config");
    var config = await response.json();
    codeNode.textContent = config.code;
    urlNode.textContent = config.phoneUrl;
    var qr = qrcode(0, "M");
    qr.addData(config.phoneUrl);
    qr.make();
    document.getElementById("qr").innerHTML = qr.createSvgTag(5, 2);
  }

  async function poll() {
    var response = await fetch("/api/ultimo");
    var data = await response.json();
    if (!data.id || data.id === shown) return;
    shown = data.id;
    waitNode.textContent = "Lettura pronta.";
    fieldsNode.hidden = false;
    linesNode.hidden = false;
    linesNode.value = (data.lines || []).join("\n");
    var sex = data.sex === "M" ? "M" : data.sex === "F" ? "F" : "non indicato";
    fieldsNode.innerHTML = [
      box("Documento", data.kind),
      box("Cognome", data.surname),
      box("Nome", data.givenNames),
      box("Nascita", data.birthDate),
      box("Sesso", sex),
      box("Scadenza", data.expiryDate),
      box("Cittadinanza", data.nationality),
      box("Numero", data.documentNumber),
    ].join("");
    copyButton.disabled = false;
    hintNode.textContent = "Nel gestionale: Incolla dagli appunti, poi Applica in scheda.";
    try {
      await navigator.clipboard.writeText(linesNode.value);
      hintNode.textContent = "Righe copiate. Nel gestionale: Incolla dagli appunti, poi Applica in scheda.";
    } catch (error) {
      hintNode.textContent = "Premi Copia le righe, poi nel gestionale Incolla dagli appunti.";
    }
    beep();
  }

  async function copyLines() {
    if (!linesNode.value) return;
    try {
      await navigator.clipboard.writeText(linesNode.value);
      hintNode.textContent = "Copiate. Nel gestionale: Incolla dagli appunti, poi Applica in scheda.";
    } catch (error) {
      linesNode.focus();
      linesNode.select();
      hintNode.textContent = "Seleziona le righe qui sopra e copiale con Ctrl+C.";
    }
  }

  async function clearDesk() {
    await fetch("/api/azzera", { method: "POST" });
    shown = 0;
    waitNode.textContent = "In attesa di una carta.";
    fieldsNode.hidden = true;
    fieldsNode.innerHTML = "";
    linesNode.hidden = true;
    linesNode.value = "";
    copyButton.disabled = true;
    hintNode.textContent = "";
  }

  function box(label, value) {
    return "<div><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(value || "") + "</strong></div>";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char];
    });
  }

  function beep() {
    try {
      var ctx = new AudioContext();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (error) {
      /* il suono è solo un avviso */
    }
  }
})();
