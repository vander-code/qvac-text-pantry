# Text Pantry (QVAC)

A simple local app to save useful text (commands, notes, links, templates, password hints, ideas)
and find it again by **meaning**. Search "how do I undo a commit" and it finds your
`git reset --soft HEAD~1` snippet, even though the words don't match.

The AI runs **on your own computer** using [QVAC](https://github.com/tetherto/qvac), Tether's open-source
AI SDK. No API key, no cloud service, and your snippets never leave your machine.

![screenshot](screenshot.png)

## SDK version

`@qvac/sdk` **0.19.0** (declared in `package.json`)

Functions used: `loadModel` and `embed`, with the `EMBEDDINGGEMMA_300M_Q4_0` embedding model.

## Install

You need [Node.js](https://nodejs.org) (current LTS) and a little free disk space for the model.

```bash
git clone https://github.com/YOUR-USERNAME/qvac-text-pantry.git
cd qvac-text-pantry
npm install
```

## Run

```bash
npm start
```

Then open **http://localhost:3002** in your browser.

The first start downloads the model, which can take a few minutes. Keyword search works while it loads.
Click **Add example snippets** to try it out.

## How it works

- Every snippet is turned into a list of numbers (an embedding) with QVAC's `embed`. Similar meanings get similar numbers.
- Your search is embedded the same way, and snippets are ranked by cosine similarity, plus a small bonus for exact word matches.
- Snippets are saved in `data/snippets.json` on your computer. This folder is git-ignored so you never upload your own data.
- `public/index.html` is the whole interface (plain HTML, CSS and JavaScript).

## Privacy note

Save password **hints**, not real passwords. The data file is plain, unencrypted text.

## License

MIT
