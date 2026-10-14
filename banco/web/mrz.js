/* Stessa regola di banco/mrz.py: ICAO 9303, TD1 (CIE) e TD3 (passaporto). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MRZ = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var WEIGHTS = [7, 3, 1];
  var DIGIT_FIX = { O: "0", Q: "0", D: "0", I: "1", L: "1", B: "8", S: "5", Z: "2", G: "6" };

  function value(char) {
    if (char >= "0" && char <= "9") return char.charCodeAt(0) - 48;
    if (char >= "A" && char <= "Z") return char.charCodeAt(0) - 55;
    if (char === "<") return 0;
    return -1;
  }

  function checkDigit(data) {
    var total = 0;
    for (var i = 0; i < data.length; i += 1) {
      var n = value(data.charAt(i));
      if (n < 0) return null;
      total += n * WEIGHTS[i % 3];
    }
    return String(total % 10);
  }

  function matches(digit, data, allowFiller) {
    var got = checkDigit(data);
    if (got === null) return false;
    if (digit === got) return true;
    return Boolean(allowFiller) && digit === "<" && got === "0";
  }

  function clean(text) {
    return String(text || "")
      .toUpperCase()
      .replace(/[«»‹›＜]/g, "<")
      .replace(/ /g, "")
      .replace(/[^A-Z0-9<\n\r]/g, "\n");
  }

  function pad(line, size) {
    if (line.length > size || line.length < size - 8) return null;
    return line + "<".repeat(size - line.length);
  }

  function candidates(text) {
    var lines = clean(text).split(/\r?\n/).filter(Boolean);
    var found = [];
    if (lines.length >= 3) {
      var td1 = [pad(lines[0], 30), pad(lines[1], 30), pad(lines[2], 30)];
      if (td1.every(Boolean)) found.push(td1);
    }
    if (lines.length >= 2) {
      var td3 = [pad(lines[0], 44), pad(lines[1], 44)];
      if (td3.every(Boolean)) found.push(td3);
    }
    var blob = lines.join("");
    if (blob.length >= 82) {
      var parts = [blob.slice(0, 30), blob.slice(30, 60), blob.slice(60, 90)];
      var glued = [pad(parts[0], 30), pad(parts[1], 30), pad(parts[2], 30)];
      if (glued.every(Boolean)) found.push(glued);
    }
    if (blob.length >= 80) {
      var pair = [blob.slice(0, 44), blob.slice(44, 88)];
      var gluedPair = [pad(pair[0], 44), pad(pair[1], 44)];
      if (gluedPair.every(Boolean)) found.push(gluedPair);
    }
    return found;
  }

  function fixDigits(line, spans) {
    var chars = line.split("");
    spans.forEach(function (span) {
      for (var i = span[0]; i < span[1]; i += 1) {
        if (DIGIT_FIX[chars[i]]) chars[i] = DIGIT_FIX[chars[i]];
      }
    });
    return chars.join("");
  }

  function cleanName(part) {
    return part.replace(/</g, " ").replace(/\s+/g, " ").trim();
  }

  function splitName(field) {
    var cut = field.indexOf("<<");
    if (cut < 0) return [cleanName(field), ""];
    return [cleanName(field.slice(0, cut)), cleanName(field.slice(cut + 2))];
  }

  function ymd(value) {
    if (!/^\d{6}$/.test(value)) return null;
    var month = Number(value.slice(2, 4));
    var day = Number(value.slice(4, 6));
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return [Number(value.slice(0, 2)), month, day];
  }

  function birth(value, today) {
    var parts = ymd(value);
    if (!parts) return null;
    var year = 2000 + parts[0];
    var current = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    if (year * 10000 + parts[1] * 100 + parts[2] > current) year -= 100;
    return pad2(parts[2]) + "/" + pad2(parts[1]) + "/" + year;
  }

  function expiry(value) {
    var parts = ymd(value);
    if (!parts) return null;
    return pad2(parts[2]) + "/" + pad2(parts[1]) + "/" + (2000 + parts[0]);
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  var LETTER_FIX = { "0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B" };
  var DOC_ALTS = {
    "0": "CODQ", "O": "0QD", "Q": "0O", "D": "0O", "1": "IL", "I": "1L", "L": "1",
    "8": "B", "B": "8", "5": "S", "S": "5", "2": "Z", "Z": "2", "6": "GC", "G": "6C", "C": "0G",
  };

  function mapSpan(text, start, end, table) {
    var chars = text.split("");
    for (var i = start; i < end; i += 1) if (table[chars[i]]) chars[i] = table[chars[i]];
    return chars.join("");
  }

  function buryFalseFillers(line) {
    var chars = line.split("");
    var index = 0;
    while (index < chars.length) {
      if (chars[index] !== "<") { index += 1; continue; }
      var end = index;
      var intruders = [];
      while (end < chars.length && (chars[end] === "<" || "KCLI".indexOf(chars[end]) >= 0)) {
        if ("KCLI".indexOf(chars[end]) >= 0) intruders.push(end);
        end += 1;
      }
      var fillers = (end - index) - intruders.length;
      if (intruders.length && (end - index) >= 5 && fillers >= 4) {
        intruders.forEach(function (pos) { chars[pos] = "<"; });
      }
      index = Math.max(end, index + 1);
    }
    return chars.join("");
  }

  function changeCost(before, after) {
    var priority = { "0O": 0, "O0": 0, "0D": 1, "D0": 1, "1I": 0, "I1": 0, "1L": 1, "L1": 1, "8B": 0, "B8": 0, "5S": 0, "S5": 0, "2Z": 0, "Z2": 0, "6G": 0, "G6": 0, "0C": 2, "C0": 2, "0Q": 8, "Q0": 8 };
    var cost = 0;
    for (var i = 0; i < before.length; i += 1) {
      if (before.charAt(i) !== after.charAt(i)) cost += 10 + (priority[before.charAt(i) + after.charAt(i)] || 4);
    }
    return cost;
  }

  function repairDocument(line, start, end, checkAt) {
    if (matches(line.charAt(checkAt), line.slice(start, end))) return [line];
    var found = [];
    for (var pos = start; pos < end; pos += 1) {
      var alts = DOC_ALTS[line.charAt(pos)] || "";
      for (var a = 0; a < alts.length; a += 1) {
        var trial = line.slice(0, pos) + alts.charAt(a) + line.slice(pos + 1);
        if (matches(trial.charAt(checkAt), trial.slice(start, end))) found.push(trial);
      }
    }
    found.sort(function (left, right) { return changeCost(line, left) - changeCost(line, right); });
    return found;
  }

  function finishTd1(line1, line2, line3, today) {
    if (!matches(line2.charAt(6), line2.slice(0, 6))) return null;
    if (!matches(line2.charAt(14), line2.slice(8, 14))) return null;
    var composite = line1.slice(5, 30) + line2.slice(0, 7) + line2.slice(8, 15) + line2.slice(18, 29);
    if (!matches(line2.charAt(29), composite)) return null;
    var born = birth(line2.slice(0, 6), today);
    var until = expiry(line2.slice(8, 14));
    if (!born || !until) return null;
    var name = splitName(line3);
    var code = line1.slice(0, 2).replace(/</g, "");
    return result(code, line1.slice(2, 5), line1.slice(5, 14), name, born, line2.charAt(7), until, line2.slice(15, 18), [line1, line2, line3], "TD1");
  }

  function finishTd3(line1, line2, today) {
    if (!matches(line2.charAt(19), line2.slice(13, 19))) return null;
    if (!matches(line2.charAt(27), line2.slice(21, 27))) return null;
    if (!matches(line2.charAt(42), line2.slice(28, 42), true)) return null;
    var composite = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43);
    if (!matches(line2.charAt(43), composite)) return null;
    var born = birth(line2.slice(13, 19), today);
    var until = expiry(line2.slice(21, 27));
    if (!born || !until) return null;
    var name = splitName(line1.slice(5, 44));
    var code = line1.slice(0, 2).replace(/</g, "");
    return result(code, line1.slice(2, 5), line2.slice(0, 9), name, born, line2.charAt(20), until, line2.slice(10, 13), [line1, line2], "TD3");
  }

  function best(original, repairs, finish) {
    var winner = null;
    var cost = 1e9;
    repairs.forEach(function (trial) {
      var parsed = finish(trial);
      var rank = changeCost(original, trial);
      if (parsed && rank < cost) { winner = parsed; cost = rank; }
    });
    return winner;
  }

  function parseTd1(lines, today) {
    var line1 = fixDigits(buryFalseFillers(lines[0]), [[14, 15]]);
    line1 = mapSpan(line1, 2, 5, LETTER_FIX);
    var line2 = fixDigits(buryFalseFillers(lines[1]), [[0, 7], [8, 15], [29, 30]]);
    line2 = mapSpan(line2, 15, 18, LETTER_FIX);
    var line3 = buryFalseFillers(lines[2]);
    return best(line1, repairDocument(line1, 5, 14, 14), function (trial) {
      return finishTd1(trial, line2, line3, today);
    });
  }

  function parseTd3(lines, today) {
    var line1 = buryFalseFillers(lines[0]);
    line1 = mapSpan(line1, 2, 5, LETTER_FIX);
    var line2 = fixDigits(buryFalseFillers(lines[1]), [[9, 10], [13, 20], [21, 28], [42, 44]]);
    line2 = mapSpan(line2, 10, 13, LETTER_FIX);
    return best(line2, repairDocument(line2, 0, 9, 9), function (trial) {
      return finishTd3(line1, trial, today);
    });
  }

  function result(code, issuer, number, name, born, sex, until, nationality, lines, format) {
    return {
      format: format,
      kind: code.charAt(0) === "P" ? "passaporto" : "carta",
      documentCode: code,
      issuer: issuer.replace(/</g, ""),
      documentNumber: number.replace(/<+$/g, ""),
      surname: name[0],
      givenNames: name[1],
      birthDate: born,
      sex: sex,
      expiryDate: until,
      nationality: nationality.replace(/</g, ""),
      lines: lines,
    };
  }

  function parse(text, today) {
    var day = today instanceof Date ? today : new Date();
    var options = candidates(text);
    for (var i = 0; i < options.length; i += 1) {
      var parsed = options[i].length === 3 ? parseTd1(options[i], day) : parseTd3(options[i], day);
      if (parsed) return parsed;
    }
    return null;
  }

  return { parse: parse, checkDigit: checkDigit };
});
