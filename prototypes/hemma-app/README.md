# Hemma

Rita ditt hem i 2D och 3D – och styr det smarta hemmet från samma ställe.

- **Bygg:** rum, väggar, dörrar, fönster (rullgardin/persienn), kök, möbler, belysning, media, utomhus. Mått och färger per sak. Bakgrundsbild med kalibrering.
- **Styr:** lampor (ljusstyrka), dörrar/portar (öppen/stängd), gardiner, TV/högtalare, scener.
- **Koppling:** Home Assistant (WebSocket-API) som nav för Apple Home, Homey, Hue, IKEA, Sonos m.fl.

Kör: valfri statisk webbserver, t.ex. `python3 -m http.server` och öppna http://localhost:8000. Ingen byggprocess; Three.js laddas från CDN.
Data sparas i webbläsaren (localStorage) och kan sparas/öppnas som fil.
