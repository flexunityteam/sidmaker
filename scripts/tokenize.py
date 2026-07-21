#!/usr/bin/env python3
"""Minimal C64 BASIC v2 tokenizer -> .prg (load address $0801)."""
import os

TOKENS = {
    "END":0x80,"FOR":0x81,"NEXT":0x82,"DATA":0x83,"INPUT#":0x84,"INPUT":0x85,
    "DIM":0x86,"READ":0x87,"LET":0x88,"GOTO":0x89,"RUN":0x8A,"IF":0x8B,
    "RESTORE":0x8C,"GOSUB":0x8D,"RETURN":0x8E,"REM":0x8F,"STOP":0x90,"ON":0x91,
    "WAIT":0x92,"LOAD":0x93,"SAVE":0x94,"VERIFY":0x95,"DEF":0x96,"POKE":0x97,
    "PRINT#":0x98,"PRINT":0x99,"CONT":0x9A,"LIST":0x9B,"CLR":0x9C,"CMD":0x9D,
    "SYS":0x9E,"OPEN":0x9F,"CLOSE":0xA0,"GET":0xA1,"NEW":0xA2,"TAB(":0xA3,
    "TO":0xA4,"FN":0xA5,"SPC(":0xA6,"THEN":0xA7,"NOT":0xA8,"STEP":0xA9,
    "+":0xAA,"-":0xAB,"*":0xAC,"/":0xAD,"^":0xAE,"AND":0xAF,"OR":0xB0,
    ">":0xB1,"=":0xB2,"<":0xB3,"SGN":0xB4,"INT":0xB5,"ABS":0xB6,"USR":0xB7,
    "FRE":0xB8,"POS":0xB9,"SQR":0xBA,"RND":0xBB,"LOG":0xBC,"EXP":0xBD,
    "COS":0xBE,"SIN":0xBF,"TAN":0xC0,"ATN":0xC1,"PEEK":0xC2,"LEN":0xC3,
    "STR$":0xC4,"VAL":0xC5,"ASC":0xC6,"CHR$":0xC7,"LEFT$":0xC8,"RIGHT$":0xC9,
    "MID$":0xCA,"GO":0xCB,
}
KEYS = sorted(TOKENS.items(), key=lambda kv: -len(kv[0]))

def tokenize_line(text):
    out = bytearray()
    i, n = 0, len(text)
    in_quote = False
    up = text.upper()
    while i < n:
        c = text[i]
        if in_quote:
            out.append(ord(c))
            if c == '"':
                in_quote = False
            i += 1
            continue
        if c == '"':
            out.append(ord(c)); in_quote = True; i += 1; continue
        matched = None
        for kw, tok in KEYS:
            if up.startswith(kw, i):
                matched = (kw, tok); break
        if matched:
            kw, tok = matched
            out.append(tok); i += len(kw)
            if tok == 0x8F:  # REM: rest of line literal
                for c2 in text[i:]:
                    out.append(ord(c2))
                i = n
            continue
        out.append(ord(c.upper())); i += 1
    return out

def build_prg(lines):
    START = 0x0801
    records = []
    for lineno, text in lines:
        b = bytearray([lineno & 0xFF, (lineno >> 8) & 0xFF])
        b += tokenize_line(text); b.append(0x00)
        records.append(b)
    out = bytearray([START & 0xFF, (START >> 8) & 0xFF])
    addr = START
    for rec in records:
        nxt = addr + 2 + len(rec)
        out.append(nxt & 0xFF); out.append((nxt >> 8) & 0xFF)
        out += rec; addr = nxt
    out.append(0x00); out.append(0x00)
    return out

GUESS = [
    (10,'PRINT CHR$(147)'),
    (20,'PRINT "  * SIDMAKER GUESS *"'),
    (30,'N=INT(RND(1)*100)+1'),(40,'T=0'),(50,'PRINT'),
    (60,'PRINT "I AM THINKING OF 1 TO 100"'),
    (70,'INPUT "YOUR GUESS";G'),(80,'T=T+1'),
    (90,'IF G<N THEN PRINT "TOO LOW":GOTO 70'),
    (100,'IF G>N THEN PRINT "TOO HIGH":GOTO 70'),
    (110,'PRINT "CORRECT! IN";T;"TRIES"'),
    (120,'PRINT "PLAY AGAIN? Y/N"'),(130,'GET A$'),
    (140,'IF A$="" THEN 130'),(150,'IF A$="Y" THEN 30'),(160,'PRINT "BYE!"'),
]

# Spy Chase: steer (joystick or A/D), fire/space to shoot the red cars,
# dodge them. Screen POKEs for speed. B=screen, V=colour, R=player row offset.
SPY = [
    (5,'POKE 53280,0:POKE 53281,0:PRINT CHR$(147)'),
    (6,'PRINT:PRINT "     *** SIDMAKER SPY CHASE ***"'),
    (7,'PRINT:PRINT "  STEER: JOYSTICK OR A / D KEYS"'),
    (8,'PRINT "  FIRE OR SPACE = SHOOT RED CARS"'),
    (9,'PRINT "  DODGE THEM - YOU HAVE 3 LIVES"'),
    (10,'PRINT:PRINT "  PRESS FIRE OR ANY KEY TO START"'),
    (11,'GET A$:J=PEEK(56320)AND PEEK(56321):IF A$="" AND (J AND 16)=16 THEN 11'),
    (20,'PRINT CHR$(147):B=1024:V=55296:R=880'),
    (30,'FOR Y=0 TO 24:POKE B+Y*40+13,160:POKE V+Y*40+13,14:POKE B+Y*40+27,160:POKE V+Y*40+27,14:NEXT'),
    (40,'P=20:E=1:F=20:S=0:L=3'),
    (60,'J=PEEK(56320)AND PEEK(56321):GET A$'),
    (70,'IF ((J AND 4)=0 OR A$="A") AND P>14 THEN POKE B+R+P,32:P=P-1'),
    (80,'IF ((J AND 8)=0 OR A$="D") AND P<26 THEN POKE B+R+P,32:P=P+1'),
    (90,'IF ((J AND 16)=0 OR A$=" ") AND F=P THEN POKE B+E*40+F,32:S=S+5:E=1:F=14+INT(RND(1)*13)'),
    (100,'POKE B+R+P,30:POKE V+R+P,7'),
    (110,'POKE B+E*40+F,32:E=E+1'),
    (120,'IF E>22 THEN E=1:F=14+INT(RND(1)*13):S=S+1'),
    (130,'POKE B+E*40+F,81:POKE V+E*40+F,2'),
    (140,'IF E=22 AND F=P THEN GOSUB 200'),
    (150,'FOR T=1 TO 35:NEXT:GOTO 60'),
    (200,'POKE B+E*40+F,32:L=L-1'),
    (210,'FOR T=1 TO 8:POKE 53280,2:FOR U=1 TO 25:NEXT:POKE 53280,0:FOR U=1 TO 25:NEXT:NEXT'),
    (220,'IF L=0 THEN 300'),
    (230,'E=1:F=20:RETURN'),
    (300,'PRINT CHR$(147):PRINT:PRINT "  GAME OVER":PRINT:PRINT "  SCORE";S'),
    (310,'PRINT:PRINT "  PLAY AGAIN? Y/N"'),
    (320,'GET A$:IF A$="" THEN 320'),
    (330,'IF A$="Y" THEN RUN'),(340,'PRINT:PRINT "  BYE!":END'),
]

roms = os.path.expanduser('~/Developing/sidmaker/public/roms')
os.makedirs(roms, exist_ok=True)
for name, prog in [('guess', GUESS), ('spychase', SPY)]:
    out = build_prg(prog)
    with open(os.path.join(roms, name + '.prg'), 'wb') as f:
        f.write(out)
    print(f'wrote {name}.prg {len(out)} bytes; head:', ' '.join(f'{x:02x}' for x in out[:12]))
