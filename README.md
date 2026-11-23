# anagrafica

Note di manutenzione sito **servizialcittadino.org** (gestione prenotazioni / modulo documenti).

## Modulo documenti — pagina non trovata (2026-11-23)

Dopo la prenotazione online, il gestionale a volte inviava l’utente a URL sul sito pubblico che non esistevano (`/modulo-documenti/`, `/invito-documenti/`), con errore 404.

### Intervento su WordPress

- Pubblicate le pagine [modulo-documenti](https://servizialcittadino.org/modulo-documenti/) e [invito-documenti](https://servizialcittadino.org/invito-documenti/) con reindirizzamento verso `https://gestione.servizialcittadino.org/invito_documenti.php` (token da query string o hash).
- Aggiornata la pagina [Prenotazioni](https://servizialcittadino.org/prenotazioni/): normalizzazione client-side degli URL verso il gestionale quando il backend restituisce ancora i vecchi percorsi sul dominio principale.

### Da fare lato gestionale (opzionale)

Allineare in `prenotazione_pubblica.php` gli URL di `redirect_url` / `invito_documenti.url` e `gestione_link` al dominio `gestione.servizialcittadino.org`, così il sito non dipende solo dal fallback.

## richiesta_protesi.php — 404 (2026-11-23)

Il file **non era presente** sul gestionale. L’articolo [Protesi acustiche a Napoli](https://servizialcittadino.org/protesi-acustiche-napoli/) puntava a `richiesta_protesi.php`.

### Sul sito WordPress (già fatto)

- Pulsante **Invia dati e decreto** aggiornato: punta al form Otter nella stessa pagina (`#wp-block-themeisle-blocks-form-c8e2f21a`).

### Sul gestionale (da caricare)

- In repo: `gestione/richiesta_protesi.php` — redirect 302 al form sul sito.
- Copiare il file nella root di `gestione.servizialcittadino.org` (accanto a `richiesta_isee.php`).