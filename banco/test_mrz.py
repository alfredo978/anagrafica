"""Prove del lettore MRZ. Il passaporto UTO è l'esempio pubblico ICAO 9303, non una persona vera."""

import unittest
from datetime import date

from mrz import check_digit, parse

TODAY = date(2026, 10, 14)
PASSPORT = "\n".join(
    [
        "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
        "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
    ]
)


def build_td1():
    line1 = "C<ITACA12345XX"
    line1 += check_digit(line1[5:14])
    line1 += "<" * (30 - len(line1))
    line2 = "850101"
    line2 += check_digit(line2)
    line2 += "M"
    expiry = "340210"
    line2 += expiry + check_digit(expiry) + "ITA" + ("<" * 11)
    composite = line1[5:30] + line2[0:7] + line2[8:15] + line2[18:29]
    line2 += check_digit(composite)
    line3 = "ROSSI<<MARIO" + ("<" * (30 - len("ROSSI<<MARIO")))
    return "\n".join([line1, line2, line3])


class MrzTest(unittest.TestCase):
    def test_passport_specimen(self):
        self.assertEqual(len(PASSPORT.splitlines()[0]), 44)
        self.assertEqual(len(PASSPORT.splitlines()[1]), 44)
        parsed = parse(PASSPORT, TODAY)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["format"], "TD3")
        self.assertEqual(parsed["kind"], "passaporto")
        self.assertEqual(parsed["issuer"], "UTO")
        self.assertEqual(parsed["documentNumber"], "L898902C3")
        self.assertEqual(parsed["surname"], "ERIKSSON")
        self.assertEqual(parsed["givenNames"], "ANNA MARIA")
        self.assertEqual(parsed["birthDate"], "12/08/1974")
        self.assertEqual(parsed["sex"], "F")
        self.assertEqual(parsed["expiryDate"], "15/04/2012")
        self.assertEqual(parsed["nationality"], "UTO")

    def test_cie_shape(self):
        parsed = parse(build_td1(), TODAY)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["format"], "TD1")
        self.assertEqual(parsed["kind"], "carta")
        self.assertEqual(parsed["issuer"], "ITA")
        self.assertEqual(parsed["documentNumber"], "CA12345XX")
        self.assertEqual(parsed["surname"], "ROSSI")
        self.assertEqual(parsed["givenNames"], "MARIO")
        self.assertEqual(parsed["birthDate"], "01/01/1985")
        self.assertEqual(parsed["sex"], "M")
        self.assertEqual(parsed["expiryDate"], "10/02/2034")
        self.assertEqual(parsed["nationality"], "ITA")

    def test_digit_lookalikes_in_the_date(self):
        text = build_td1().replace("850101", "85O1O1")
        parsed = parse(text, TODAY)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["birthDate"], "01/01/1985")
        self.assertIn("850101", parsed["lines"][1])

    def test_broken_check_digit_is_refused(self):
        lines = PASSPORT.splitlines()
        broken = lines[1][:9] + ("0" if lines[1][9] != "0" else "1") + lines[1][10:]
        self.assertIsNone(parse(lines[0] + "\n" + broken, TODAY))

    def test_empty(self):
        self.assertIsNone(parse("non è una MRZ", TODAY))

    def test_typical_ocr_confusions(self):
        noisy = "\n".join(
            [
                "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<K<<<<",
                "L898902036UT07408122F1204159ZE184226B<<<<<10",
            ]
        )
        parsed = parse(noisy, TODAY)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["surname"], "ERIKSSON")
        self.assertEqual(parsed["givenNames"], "ANNA MARIA")
        self.assertEqual(parsed["documentNumber"], "L898902C3")
        self.assertEqual(parsed["nationality"], "UTO")
        self.assertEqual(parsed["lines"][1][7], "C")


if __name__ == "__main__":
    unittest.main()
