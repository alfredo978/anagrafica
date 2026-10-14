# Lettore MRZ dello sportello

Il telefono inquadra le righe in fondo alla CIE o al passaporto. Questo PC riceve il testo e lo copia negli appunti. Nel gestionale si usa la finestra già presente: **Incolla dagli appunti**, poi **Applica in scheda**.

La webcam del PC non serve. Non si crea un'altra anagrafica: si riempie quella che c'è.

## Avvio

Sul PC dello sportello, in questa cartella:

```text
python3 avvia.py
```

Su Windows, doppio clic su `avvia.bat` (serve Python 3, con «Add to PATH» in installazione).

Si apre la pagina dello sportello. Lì ci sono l'indirizzo da aprire sul telefono e un codice di 4 cifre.

Sul telefono:

1. Apri l'indirizzo `https://…` indicato sul PC. Telefono e PC sulla stessa rete.
2. Se il browser dice che la connessione non è privata, tocca **Avanzate** e poi **Procedi**. Senza questo la camera non si accende: il certificato è locale, i dati non escono dallo sportello.
3. Digita il codice.
4. Consenti la camera e tieni le righe MRZ dentro la fascia gialla.
5. Quando il PC mostra la lettura, nel gestionale premi **Incolla dagli appunti** e **Applica in scheda**.

Se Windows chiede il permesso per la rete, accetta solo le reti private.

## Che cosa legge

Dalla MRZ: tipo di documento, Stato, numero, cognome, nome, nascita, sesso, scadenza, cittadinanza. Le cifre di controllo ICAO devono tornare, altrimenti la lettura si scarta.

Non legge il codice fiscale, la foto, il luogo di nascita o la residenza. Per quelli resta il lettore USB della CIE, con il cittadino presente e il CAN o la chiave ricavata dalla MRZ.

## Dati

L'ultima lettura sta solo nella memoria del programma, finché non si preme **Cancella** o non si chiude. Non salva l'immagine e non la manda a un servizio esterno. Il motore di lettura (Tesseract.js) è nella cartella `web/vendor` e gira sul telefono.
