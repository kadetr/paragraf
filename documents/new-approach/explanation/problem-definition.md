# Problem Definition

Paragraf addresses a problem that sits between software development, digital typography, and document publishing: **generating a document is not the same as typesetting a publication**.

Software libraries can create PDF files, draw text at coordinates, place images, divide content into pages, and generate documents from structured data. These capabilities are sufficient for many reporting, invoicing, form-generation, and general document-automation tasks.

Publication-quality composition introduces a different set of requirements.

Text must be shaped according to the rules of the script and font. Lines must be composed using more than the next available word that fits. Hyphenation must respect language. Bidirectional text must be handled correctly. Font metrics affect line composition. Optical adjustments affect the perceived edge of a paragraph. Styles, page geometry, colour, and document structure must eventually work together as part of a complete publication.

The problem is therefore not one isolated algorithm or missing PDF feature. It is the coordination of multiple systems that traditionally belong to different technical and professional domains.

## Typography and Software

Typography and software development often describe the same document using different models.

A software developer may think in terms of strings, objects, dimensions, coordinates, functions, configuration, and output files.

A typographer or publication designer may think in terms of glyphs, measure, leading, paragraph colour, rivers, hyphenation, optical alignment, styles, pages, spreads, and print characteristics.

Neither model is incorrect. They describe different aspects of the same system.

For example, a developer may represent a paragraph as Unicode text with a width constraint and a style object. A typographer evaluates the same paragraph through line lengths, word spacing, hyphenation, visual rhythm, and the overall colour of the text block.

This difference becomes important when typographic decisions are implemented as software. Concepts that are normally evaluated visually must become explicit enough to be represented, configured, tested, and reproduced programmatically.

Paragraf therefore operates between two perspectives:

- **typographic intent**, concerned with the visual and editorial quality of a publication;
- **software representation**, concerned with expressing those decisions through data structures, algorithms, parameters, and reproducible processes.

The objective is not to replace one perspective with the other. A publishing system has to represent both.

## Terminology

The two fields also use different technical vocabularies.

Some concepts have close equivalents:

| Typography / publishing | Software-oriented representation |
| --- | --- |
| leading | line spacing / line-height |
| measure | available line width |
| paragraph style | reusable style definition |
| font metrics | numeric measurements of glyphs and fonts |
| page geometry | dimensions and layout constraints |

Other concepts do not map cleanly.

**Paragraph colour**, for example, does not refer to RGB or CMYK colour. It describes the perceived density and consistency of a text block.

**Rivers** are visually distracting paths of whitespace that can appear across consecutive lines of justified text. They are a perceptual property of the composition rather than a single numeric value.

**Optical margin alignment** deliberately allows certain glyphs to extend beyond a geometric text boundary so that the edge appears visually aligned.

These concepts illustrate an important constraint for programmatic publishing: not every typographic concept begins as a simple software property.

A software system must decide which aspects can be expressed numerically, which require algorithms, which depend on language or font data, and which remain matters of visual judgment.

## Three Gaps

The relationship between typography and software can be described through three recurring gaps.

### Terminology Gap

Both fields have specialised terminology, but their terms do not always correspond directly.

A software developer may understand a document through strings, dimensions, and rendering operations while a typographer discusses measure, tracking, paragraph colour, or optical alignment.

The challenge is not merely translating specialist terminology into simpler language. In many cases both sides already use precise technical language; they are describing the document from different professional perspectives.

A programmatic publishing system therefore needs a vocabulary that connects the two without erasing their differences.

### Perceptual Gap

Software is normally evaluated against explicit behaviour:

- does the function return the expected result?
- does the output conform to the schema?
- does the algorithm satisfy its tests?
- are dimensions and values correct?

Typography also depends on perceptual evaluation.

A paragraph may be technically valid and still contain poor spacing. A justified block may satisfy its width constraints and still contain visible rivers. A punctuation mark may be geometrically inside a margin while making the paragraph edge appear misaligned.

The challenge is to translate enough of this visual judgment into parameters and algorithms that software can reproduce useful typographic behaviour.

This does not eliminate human judgment. Instead, it makes relevant typographic decisions explicit and controllable.

### Programmability Gap

Professional publishing applications provide sophisticated composition and page-layout capabilities, but they are primarily interactive publishing environments.

Software libraries, on the other hand, are easy to integrate into automated systems but frequently concentrate on document generation and rendering rather than the complete set of typographic and publishing concerns required for high-quality composition.

This creates a gap between:

- rich publishing capabilities available in specialist tools, and
- composable APIs suitable for modern software systems and automated workflows.

Paragraf is intended to operate within this gap by treating typography and publishing capabilities as programmable components rather than interactions tied exclusively to a graphical publishing application.

## Scope of the Problem

The problem can be divided into two broad areas.

### Technical Foundations

The first area concerns the computational foundations required to transform text into correctly composed content.

Examples include:

- Unicode and bidirectional text processing;
- font loading, selection, fallback, and metrics;
- OpenType shaping;
- language-aware hyphenation;
- paragraph-wide line breaking;
- spacing and justification;
- optical margin alignment;
- other algorithms involved in text composition.

These concerns are discussed in **Technical Foundations**.

### Publishing

The second area concerns the construction and output of a publication.

Examples include:

- document and page models;
- paper and page geometry;
- reusable styles;
- colour representation and management;
- placement of composed content;
- PDF generation;
- print-oriented output requirements.

These concerns are discussed in **Publishing**.

The two areas are related but distinct. Technical foundations determine how content is composed; publishing concerns determine how that content becomes part of a structured document and ultimately a publication.

Paragraf brings these concerns into the same programmable system while keeping their responsibilities explicit.