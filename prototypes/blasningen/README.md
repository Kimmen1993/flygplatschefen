# Prototyp 6: Blåsningen

**Hypotes:** Bruket blir roligt när kärnan är en konkret, synlig handling. Du lastar själv kol och malm lager för lager, ser lagren sjunka och tappar järnet med rätt tajming. Skiften är korta (4–5 min), har ett mål och ger stjärnor. Det ersätter "två reglage och vänta" och ett helt år på 20 minuter.

**Bakgrund:** Bruksåret (prototyp 5) fick kritik i två speltester ("fattar inte vad som är grejen"). En agent med nya ögon spelade igen, och en speldesigner granskade det kritiskt. Båda kom fram till samma sak: det var för många samtidiga, dolda och fördröjda system, och det enda roliga var att tappa järnet.

**Kör:** öppna `index.html` (ingen build, bara canvas 2D). Tangenter: K kol, M malm, håll J för att tappa, håll S för att släppa slagg, mellanslag stöter loss, ↑↓ ändrar blästern.

**Status:** pågår, väntar på användarens speltest.

**Botresultat (3 uppdrag):**
- Skicklig: 3★ / 2★ / 3★.
- Nybörjare som gör det masmästaren säger: 1★ / 1★ / 2★.
- Slarvig (K-M-M-rytm, tappar sent): härden fryser i alla tre.

**Lärt under bygget:**
- Värmen måste ha tröghet. Med en tidskonstant på 2,6 s störtdök ugnen till 740 °C efter några korgar för mycket malm. Nu är tidskonstanten 5 s, utjämningen 8 s, golvet 1 060 °C och frysningen kräver 8 s under gränsen.
- Råden måste vara konkreta ("ladda 2–3 kol i rad"). "Mer kol" ledde till överkorrigering.

**Nästa steg om det håller:** bygg ut bruket mellan skiften (kolhus, damm, rostugn och kolarstugor på en karta), fler uppdrag och epoker.
