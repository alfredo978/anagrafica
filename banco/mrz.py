"""Lettura delle righe MRZ secondo ICAO 9303.

TD1, tre righe da 30 caratteri: carta d'identità, compresa la CIE.
TD3, due righe da 44 caratteri: passaporto.
"""

from __future__ import annotations

from datetime import date

ALPHABET = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")
WEIGHTS = (7, 3, 1)
DIGIT_FIX = str.maketrans(
    {
        "O": "0",
        "Q": "0",
        "D": "0",
        "I": "1",
        "L": "1",
        "B": "8",
        "S": "5",
        "Z": "2",
        "G": "6",
    }
)
LETTER_FIX = str.maketrans({"0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B"})
DOC_ALTS = {
    "0": "CODQ",
    "O": "0QD",
    "Q": "0O",
    "D": "0O",
    "1": "IL",
    "I": "1L",
    "L": "1",
    "8": "B",
    "B": "8",
    "5": "S",
    "S": "5",
    "2": "Z",
    "Z": "2",
    "6": "GC",
    "G": "6C",
    "C": "0G",
}


def check_digit(data: str) -> str | None:
    total = 0
    for index, char in enumerate(data):
        value = _value(char)
        if value < 0:
            return None
        total += value * WEIGHTS[index % 3]
    return str(total % 10)


def parse(text: str, today: date | None = None) -> dict | None:
    """Restituisce i campi se le cifre di controllo tornano, altrimenti None."""
    if today is None:
        today = date.today()
    for lines in _candidates(text):
        if len(lines) == 3:
            parsed = _parse_td1(lines, today)
        else:
            parsed = _parse_td3(lines, today)
        if parsed:
            return parsed
    return None


def _value(char: str) -> int:
    if "0" <= char <= "9":
        return ord(char) - 48
    if "A" <= char <= "Z":
        return ord(char) - 55
    if char == "<":
        return 0
    return -1


def _candidates(text: str) -> list[list[str]]:
    lines = [line for line in _clean(text).splitlines() if line]
    found: list[list[str]] = []
    if len(lines) >= 3:
        padded = [_pad(lines[0], 30), _pad(lines[1], 30), _pad(lines[2], 30)]
        if all(padded):
            found.append(padded)  # type: ignore[arg-type]
    if len(lines) >= 2:
        padded = [_pad(lines[0], 44), _pad(lines[1], 44)]
        if all(padded):
            found.append(padded)  # type: ignore[arg-type]
    blob = "".join(lines)
    if len(blob) >= 82:
        parts = [blob[0:30], blob[30:60], blob[60:90]]
        padded = [_pad(parts[0], 30), _pad(parts[1], 30), _pad(parts[2], 30)]
        if all(padded):
            found.append(padded)  # type: ignore[arg-type]
    if len(blob) >= 80:
        parts = [blob[0:44], blob[44:88]]
        padded = [_pad(parts[0], 44), _pad(parts[1], 44)]
        if all(padded):
            found.append(padded)  # type: ignore[arg-type]
    return found


def _clean(text: str) -> str:
    text = text.upper().translate(str.maketrans({"«": "<", "»": "<", "‹": "<", "›": "<", "＜": "<"}))
    text = text.replace(" ", "")
    return "".join(char if char in ALPHABET or char in "\n\r" else "\n" for char in text)


def _pad(line: str, size: int) -> str | None:
    if len(line) > size or len(line) < size - 8:
        return None
    return line + ("<" * (size - len(line)))


def _fix_digits(line: str, spans: tuple[tuple[int, int], ...]) -> str:
    chars = list(line)
    for start, end in spans:
        chars[start:end] = list("".join(chars[start:end]).translate(DIGIT_FIX))
    return "".join(chars)


def _matches(digit: str, data: str, allow_filler: bool = False) -> bool:
    got = check_digit(data)
    if got is None:
        return False
    if digit == got:
        return True
    return allow_filler and digit == "<" and got == "0"


def _prepare(lines: list[str]) -> list[str]:
    return [_bury_false_fillers(line) for line in lines]


def _bury_false_fillers(line: str) -> str:
    chars = list(line)
    index = 0
    while index < len(chars):
        if chars[index] != "<":
            index += 1
            continue
        end = index
        intruders: list[int] = []
        while end < len(chars) and (chars[end] == "<" or chars[end] in "KCLI"):
            if chars[end] in "KCLI":
                intruders.append(end)
            end += 1
        fillers = (end - index) - len(intruders)
        if intruders and (end - index) >= 5 and fillers >= 4:
            for pos in intruders:
                chars[pos] = "<"
        index = max(end, index + 1)
    return "".join(chars)


def _repair_document_numbers(line: str, start: int, end: int, check_at: int) -> list[str]:
    if _matches(line[check_at], line[start:end]):
        return [line]
    found: list[str] = []
    for pos in range(start, end):
        for alt in DOC_ALTS.get(line[pos], ""):
            trial = line[:pos] + alt + line[pos + 1 :]
            if _matches(trial[check_at], trial[start:end]):
                found.append(trial)
    found.sort(key=lambda trial: _change_cost(line, trial))
    return found


def _change_cost(before: str, after: str) -> int:
    priority = {
        ("0", "O"): 0, ("O", "0"): 0,
        ("0", "D"): 1, ("D", "0"): 1,
        ("1", "I"): 0, ("I", "1"): 0,
        ("1", "L"): 1, ("L", "1"): 1,
        ("8", "B"): 0, ("B", "8"): 0,
        ("5", "S"): 0, ("S", "5"): 0,
        ("2", "Z"): 0, ("Z", "2"): 0,
        ("6", "G"): 0, ("G", "6"): 0,
        ("0", "C"): 2, ("C", "0"): 2,
        ("0", "Q"): 8, ("Q", "0"): 8,
    }
    cost = 0
    for old, new in zip(before, after):
        if old != new:
            cost += 10 + priority.get((old, new), 4)
    return cost


def _parse_td1(lines: list[str], today: date) -> dict | None:
    prepared = _prepare(lines)
    line1 = _fix_digits(prepared[0], ((14, 15),))
    line1 = line1[:2] + line1[2:5].translate(LETTER_FIX) + line1[5:]
    line2 = _fix_digits(prepared[1], ((0, 7), (8, 15), (29, 30)))
    line2 = line2[:15] + line2[15:18].translate(LETTER_FIX) + line2[18:]
    line3 = prepared[2]
    winners = []
    for repaired in _repair_document_numbers(line1, 5, 14, 14):
        parsed = _finish_td1(repaired, line2, line3, today)
        if parsed:
            winners.append((_change_cost(line1, repaired), parsed))
    if not winners:
        return None
    winners.sort(key=lambda item: item[0])
    return winners[0][1]


def _finish_td1(line1: str, line2: str, line3: str, today: date) -> dict | None:
    if not _matches(line2[6], line2[0:6]):
        return None
    if not _matches(line2[14], line2[8:14]):
        return None
    composite = line1[5:30] + line2[0:7] + line2[8:15] + line2[18:29]
    if not _matches(line2[29], composite):
        return None
    birth = _birth(line2[0:6], today)
    expiry = _expiry(line2[8:14])
    if birth is None or expiry is None:
        return None
    surname, given = _name(line3)
    code = line1[0:2].replace("<", "")
    return {
        "format": "TD1",
        "kind": "passaporto" if code.startswith("P") else "carta",
        "documentCode": code,
        "issuer": line1[2:5].replace("<", ""),
        "documentNumber": line1[5:14].rstrip("<"),
        "surname": surname,
        "givenNames": given,
        "birthDate": birth,
        "sex": line2[7],
        "expiryDate": expiry,
        "nationality": line2[15:18].replace("<", ""),
        "lines": [line1, line2, line3],
    }


def _parse_td3(lines: list[str], today: date) -> dict | None:
    prepared = _prepare(lines)
    line1 = prepared[0]
    line1 = line1[:2] + line1[2:5].translate(LETTER_FIX) + line1[5:]
    line2 = _fix_digits(prepared[1], ((9, 10), (13, 20), (21, 28), (42, 44)))
    line2 = line2[:10] + line2[10:13].translate(LETTER_FIX) + line2[13:]
    winners = []
    for repaired in _repair_document_numbers(line2, 0, 9, 9):
        parsed = _finish_td3(line1, repaired, today)
        if parsed:
            winners.append((_change_cost(line2, repaired), parsed))
    if not winners:
        return None
    winners.sort(key=lambda item: item[0])
    return winners[0][1]


def _finish_td3(line1: str, line2: str, today: date) -> dict | None:
    if not _matches(line2[19], line2[13:19]):
        return None
    if not _matches(line2[27], line2[21:27]):
        return None
    if not _matches(line2[42], line2[28:42], allow_filler=True):
        return None
    composite = line2[0:10] + line2[13:20] + line2[21:43]
    if not _matches(line2[43], composite):
        return None
    birth = _birth(line2[13:19], today)
    expiry = _expiry(line2[21:27])
    if birth is None or expiry is None:
        return None
    surname, given = _name(line1[5:44])
    code = line1[0:2].replace("<", "")
    return {
        "format": "TD3",
        "kind": "passaporto" if code.startswith("P") else "carta",
        "documentCode": code,
        "issuer": line1[2:5].replace("<", ""),
        "documentNumber": line2[0:9].rstrip("<"),
        "surname": surname,
        "givenNames": given,
        "birthDate": birth,
        "sex": line2[20],
        "expiryDate": expiry,
        "nationality": line2[10:13].replace("<", ""),
        "lines": [line1, line2],
    }


def _name(field: str) -> tuple[str, str]:
    surname, _, given = field.partition("<<")

    def clean(part: str) -> str:
        return " ".join(part.replace("<", " ").split())

    return clean(surname), clean(given)


def _birth(yymmdd: str, today: date) -> str | None:
    numbers = _ymd(yymmdd)
    if numbers is None:
        return None
    yy, month, day = numbers
    year = 2000 + yy
    if (year, month, day) > (today.year, today.month, today.day):
        year -= 100
    return f"{day:02d}/{month:02d}/{year}"


def _expiry(yymmdd: str) -> str | None:
    numbers = _ymd(yymmdd)
    if numbers is None:
        return None
    yy, month, day = numbers
    return f"{day:02d}/{month:02d}/{2000 + yy}"


def _ymd(yymmdd: str) -> tuple[int, int, int] | None:
    if len(yymmdd) != 6 or not yymmdd.isdigit():
        return None
    month = int(yymmdd[2:4])
    day = int(yymmdd[4:6])
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    return int(yymmdd[0:2]), month, day
