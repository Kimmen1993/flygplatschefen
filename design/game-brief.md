# Game Brief: Flygplatschefen

**One-sentence pitch:** Du är chef på en flygplats som aldrig sover: du leder trafiken live och rycker själv in när något går snett, för passet ska gå i hamn.

## Core loop
- Passet startar: plan anropar, spelaren drar dem bana → gate → service (tank, bagage) → avgång.
- Larm går (nödlandning, brand, tekniskt fel): spelaren rycker in i ett kort moment medan trafiken **fortsätter**. Att dela uppmärksamheten är svårigheten.
- Passet slutar: 1–3 stjärnor, pengar och erfarenhet låser upp fordon, personal (som kan ta enkla larm åt dig), roller och större flygplatser.
- Nästa pass är svårare.

## Player goal & fail state — what "working" looks like
- Mål: klara passets uppdrag (t.ex. "12 avgångar i tid"). 1 stjärna = klarat, 3 stjärnor = felfritt och snabbt.
- Misslyckat: plan krockar (bana/taxi), eller passets betyg faller under gränsen (förseningar, missade larm).

## MVP — what must exist to be the game
1. Flygfältet: en bana och några gater, plan som landar, taxar och lyfter; styrs genom att dra (mus och finger).
2. Markservice: tankbil och bagage som måste skickas ut i tid.
3. Pass med mål, stjärnor och betyg.
4. Räddningstjänsten: nödlandning eller brand som ett kort inryckningsmoment.
5. Hangaren: tekniskt fel, planet pusslas in, lagas och ut i tid.
6. Karriärkarta med ~10 pass och upplåsningar.
7. Framsteg sparas.

## Out of scope — not building this
- Terminalen (incheckning, gate-agent): nästa steg direkt efter MVP.
- Flygbolag och djup ekonomi, båtar, flerspelarläge.
- Appversion för telefon/dator: senare. Koden hålls redo för det (touch, skalbar skärm).

## Build order
1. Trafikkärnan (landa, taxa, gate, avgång). Den måste vara rolig först.
2. Markservice.
3. Pass, mål och stjärnor.
4. Räddningstjänsten.
5. Hangaren.
6. Karriärkartan med upplåsningar.
7. Sparning.

---
**Who it's for / what they feel:** Äldre barn till vuxna; "bara ett pass till": lätt att börja, svårt och nästan frustrerande att få tre stjärnor, men aldrig omöjligt.

**Art & audio direction:** Väljs via skisser (design/mockups) innan bygget.

**Reference game:** Genren tidsstyrda flyglednings- och "rusningsspel"; MVP:n behåller bara trafik + larm-inryckningar, ingen ekonomi.
