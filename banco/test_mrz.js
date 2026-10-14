const assert = require("assert");
const { parse } = require("./web/mrz.js");

const today = new Date(2026, 9, 14);
const passport = [
  "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
  "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
].join("\n");

const parsed = parse(passport, today);
assert.ok(parsed);
assert.strictEqual(parsed.format, "TD3");
assert.strictEqual(parsed.surname, "ERIKSSON");
assert.strictEqual(parsed.givenNames, "ANNA MARIA");
assert.strictEqual(parsed.birthDate, "12/08/1974");
assert.strictEqual(parsed.documentNumber, "L898902C3");
assert.strictEqual(parse("rotto", today), null);
const noisy = [
  "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<K<<<<",
  "L898902036UT07408122F1204159ZE184226B<<<<<10",
].join("\n");
const repaired = parse(noisy, today);
assert.strictEqual(repaired.documentNumber, "L898902C3");
assert.strictEqual(repaired.nationality, "UTO");
assert.strictEqual(repaired.surname, "ERIKSSON");
const qrcode = require("./web/vendor/qrcode.js");
const qr = qrcode(0, "M");
qr.addData("https://192.168.0.10:8443/");
qr.make();
assert.ok(qr.createSvgTag(4, 1).includes("<svg"));
console.log("mrz.js ok");
