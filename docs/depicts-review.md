# Depicts review: from gap to QuickStatements

A browser page that covers steps 1 to 5 of the pipeline for `depicts` (`P180`): select a collection, list its files without `depicts`, suggest Wikidata items from the file name, let a person decide, export. Code: [`viewer/src/review/`](../viewer/src/review/). For the experiments behind it see [`depicts-suggestions.md`](depicts-suggestions.md).

**Status (12 Nov 2026): run end to end in Chrome against `qlever.dev`, the Commons API and the Wikidata API, from the `nbtkmy.github.io` origin.** On 20 Zentralbibliothek files, 19 get candidates and about 12 a candidate that names the subject. On 18 ETH aerial photographs, 17 get the right place. Details under "Live runs".

## What it does

1. **Select a collection.** By `P195` item (preset: Zentralbibliothek Zürich, `Q190260`), by Commons category (preset: `Media contributed by the ETH-Bibliothek`), by file-name prefix, or by a Commons search, which picks a subset: `incategory:"Media_contributed_by_the_ETH-Bibliothek" intitle:Inlandflüge` gives the aerial photographs. Category members come from the MediaWiki API, because categories are not in the QLever index; QLever then answers which of them lack `depicts`.
2. **Detect the gap.** One query per batch (10, 20 or 50 files) with `LIMIT`/`OFFSET`. The file-name query has no `ORDER BY` and no `COUNT`, for the reason given in [`collections.md`](collections.md).
3. **Suggest**, from five sources:
   - **Commons categories of the file.** A category linked to a Wikidata item gives that item, or its main topic (`P301`) when the linked item is a category item.
   - **The file name.** It is cut down to its descriptive part and split into search terms (`titleParse.ts`). Each term goes to the Wikidata label search (`wbsearchentities`, which also matches aliases) and to the full-text search restricted to the preferred country (`haswbstatement:P17=Q39`). A German compound before a known head is also searched hyphenated: `Zwinglidenkmal` finds nothing, `Zwingli-Denkmal` finds the monument.
   - **The Commons description of the file** (`description.ts`). Street addresses (`Mythenquai 2`) are matched against `P6375` on Wikidata, keeping only buildings in a town the text names, or all of them if they lie in one town (every Swiss town has a `Schulhausstrasse 18`). When Wikidata has no building at the address, the street itself is offered. Quoted names, places after `am`, `beim`, `in` and the sitter of a `Porträt von …` become extra search terms; `Zürich-Enge` is searched as `Enge`. Every description term keeps only items whose label contains it as whole words (`Fritz Wunderli` is not the singer Fritz Wunderlich), and nouns after a preposition keep only located items in the preferred country (`im Haar` would otherwise give a town near Munich).
   - **Earlier decisions in the same collection** (`memory.ts`, `P195` collections only). One query loads every depicts statement of the collection (12,651 for the Zentralbibliothek, about 1 s). When at least two earlier titles with a word agree on an item, that item is suggested, with the count as the reason.
   - **Agreement.** An item that two kinds of source propose (a category and the file name, say) is shown first, in a group "Found by several sources".
   - QLever then returns the properties of all candidates of a file in one request, and the names of their types in a second, cached one. Every QLever request is retried after HTTP 429, after 3, 8 and 20 seconds.
4. **Review.** One card per file with the thumbnail, the Commons description and up to four candidates per source. Two files are looked up at a time. Nothing is pre-selected. The reviewer ticks any number of items, types another item ID, or marks "Nothing fits". Decisions are kept in the browser's local storage.
5. **Export.** `M<page id>|P180|Q<item>` lines for QuickStatements, and a JSON review log with the source of every accepted value ("file name, part 2 of 3"), its score and the reasons for its rank. The page never writes to Commons.

## How file names are read

| File name part | Result |
|---|---|
| `ETH-BIB-…-LBS H1-012345.tif`, `…-Dia 247-01234`, `…-Com LC1500-0695-001.tiff`, `… Com L33-0413-0001-0001.tif` | prefix (when present), series name and inventory code removed |
| `Zentralbibliothek Zürich - Escherdenkmal - 9910…` | institution and record number removed |
| `Jungfraujoch, Mönch, NW-Flanke`, `Luzern. Göldi-Haus am Hirschenplatz` | one term per part, split at commas and at full stops after a whole word; the first part carries a warning that it is often the wider place or the viewpoint |
| `Pommerstein bei Mols`, `Schmiedenhaus a. d. Limmat` | the whole phrase, the thing before the preposition, and the place after it (with a warning) |
| `Piano, di, Magadino` | joined to `Piano di Magadino` |
| `Genf = Genève` | two terms |
| `Allalingletscher-Tor` | the whole name, then `Allalingletscher` |
| `S. Gallen` | `St. Gallen` |
| `Rheinfelden AG`, `Koblenz (AG)` | canton code removed and used as a hint for Swiss items (`NW`, `NE`, `SO` only in brackets: they are also compass directions) |
| `Schröter, Carl (1855-1939)` | person `Carl Schröter` with life dates |
| `Dr. Fritz Mühlemann, Generalsekretär …` | person `Fritz Mühlemann` |
| `Heiner Studer, Evangelische Volkspartei (EVP)`, `Breitinger, Robert` | a possible person's name, tried as `Robert Breitinger` first, with a warning that it can be the photographer |
| `gegen Süd`, `von N.`, `v. N. aus 1900 m` | removed from the terms and reported as a heading hint |

The inventory codes (`LBS`, `Dia`, `Portr`, `Ans`, `Com`, `Hs`, …) are written from the examples in these docs, not from a full list of ETH series. A file name with an unknown code falls back to cutting a last segment that is mostly a number.

## How candidates are ranked

Category items come first, in their own group. For the items found by search, the score starts from the number of sitelinks (log scale) and is then adjusted:

- A higher position in either search, and a label equal to the term, move an item up.
- Disambiguation and duplicated pages, family and given names, categories, articles, albums, films, books and paintings are pushed down.
- For a place term: items with a coordinate location (`P625`) move up. Items whose country (`P17`) is the preferred one (default `Q39`) move up further, and a canton code in the file name doubles that; items in another country move down.
- For a person term: humans move up; a birth or death year that matches the file name moves an item up strongly, one that contradicts it moves it down.

Nothing is filtered out, at most four candidates per term are shown, and every card shows why an item ranks where it does.

## Live runs (12 Nov 2026)

Run in Chrome from `https://nbtkmy.github.io`, so cross-origin as on GitHub Pages.

| Step | Result |
|---|---|
| Gap query by `P195` (Zentralbibliothek, 20 files) | 0.3 to 0.7 s |
| Gap query by file-name prefix `ETH-BIB-`, `LIMIT 20` | 8.4 s at offset 0; at offsets 6000 and 30000 no answer within 45 s, so the ETH preset uses the category |
| Category members, categories, descriptions (Commons API) | 0.4 to 4 s per batch |
| All depicts statements of the Zentralbibliothek | 0.8 s, 12,651 rows, 6,539 of 7,224 files annotated |
| Address lookup with town | 0.8 s |
| Whole page, 20 Zentralbibliothek files, one file at a time | 48 s; 39 QLever and 82 Wikidata API requests; no error, no HTTP 429 |
| The same, two files at a time | 32 s; 4 HTTP 429 from QLever, all absorbed by the retry; no error |
| 18 ETH aerial photographs from a Commons search | 46 s; 8 HTTP 429 absorbed; no error |
| A probe run before the retry existed | failed on HTTP 429 after many test queries in a few minutes; with the retry, two 429s were absorbed |

### Quality on the first 20 Zentralbibliothek files without depicts

| Version | Files with candidates | A candidate names the subject | Only district or surroundings |
|---|---|---|---|
| Exact label match | 7 | 1 or 2 | – |
| Categories and Wikidata search | 12 | about 8 | – |
| All five sources | 19 | about 12 | 5 |
| With streets, agreement and whole-word filter (now) | 19 | about 12, plus 3 streets | 5 |

Judged from the caption, the description, the label and the Wikidata description; the thumbnail was checked for one file only. Examples of what the last version adds:

| Caption | Found | Source |
|---|---|---|
| `Unfallversicherungsgebäude` | `Q29933668` office building of the Zürich insurance, Mythenquai 2 | address in the description |
| `Kinder bei Zwinglidenkmal` | Denkmal Huldrych Zwingli (monument in Zürich), and `Q7569` Kind | hyphenated compound |
| `Alt. Usterhaus` | Paradeplatz | description ("am Paradeplatz") |
| `Aster Bouquet in Jardiniere` | Blumenstrauß | earlier decisions in the collection |
| `Papiermühle a.d. Sihl` | Sihl (river) | file name and earlier decisions |
| `Haus Bösch`, `Haus Alb. Gull` | Enge (quarter of Zürich) | description ("in Zürich-Enge") and earlier decisions |

### ETH aerial photographs (`intitle:Inlandflüge`, 18 files without depicts)

17 of 18 get the right place in at least one group, and for about 15 it is the first candidate: Churfirsten, Steckborn and the Untersee, Schwellbrunn, Schloss Wolfegg, Zaandam, IJmuiden, Schiphol, Sirnach, Uesslingen, Tobel, Bellevue. Direction hints are read where the title has them (`Churfirsten v. N.` → camera looking south). Misses: `Weisshorngipfel` (fixed afterwards: the summit now also searches `Weisshorn`), `Srbsko` whose first search hit is the country Serbia, and `Schloss Neuenburg in Freyburg`, where the search prefers the Swiss castle of the same name but the category, and so the agreement group, gives the right one. Titles of this series name places, which is what Wikidata search is good at.

Still wrong or empty on the Zentralbibliothek files: `Waldhüsli Degenried` and `Henriette Pfenninger` (no Wikidata item found); earlier decisions add noise for very common words (`Breitinger` gives "Wohngebäude" and "Zürich").

## Not done, not tested

- **Speed.** 32 s for 20 files with two lookups at a time. More would trip the QLever rate limit more often.
- **After the last fixes** (summit, guessed person names) the page was not run live again; they are covered by unit tests.
- **ETH outside the aerial series**: the press photos (`Forename Surname, role`) were only seen in the first runs.
- **QuickStatements on Commons** has not been tried with this export (see [`geocode.md`](geocode.md)). Try one file first.
- **Earlier decisions** are only as good as the existing statements; they also copy their habits (district items such as Enge on many files).
- **Not covered:** suggestions from the image itself, sampling a category at random, and a check for statements added after the QLever index was built.

## Open questions

- How many files of the ETH aerial and landscape series get a right candidate?
- Should earlier decisions also be used for categories, by asking QLever for the depicts statements of the category's files?
- Should a category item be offered when the category is broad (`General-Guisan-Quai` for a monument standing on it)?
- Is a municipality a useful `depicts` value for an aerial photograph, or should those go to `P9149` / a location property instead?
