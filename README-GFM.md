# GFM Test Document

This file exercises GitHub Flavored Markdown features that `mdprev` should render.

## Autolink Literals

Bare URLs should autolink:

- https://example.com
- http://example.com/path?query=1#hash
- www.commonmark.org
- www.commonmark.org/help

Emails should autolink:

- hello@example.com

## Tables

| Name | Value | Notes |
| --- | ---: | :--- |
| Alpha | 1 | left |
| Beta | 2 | **bold** in table |
| Gamma | 3 | `code` in table |

## Strikethrough

This is ~~deleted~~ text.

## Task Lists

- [ ] task one
- [x] task two
  - [ ] nested task
  - [x] nested done

## Code Blocks

```js
const answer = 42;
console.log(answer);
```

Inline code: `const x = 1`.

## Blockquote

> This is a blockquote.
> It has two lines.

## Lists

1. First
2. Second
   1. Nested one
   2. Nested two

- Bullet A
- Bullet B
  - Nested bullet

## Link Reference

[link text][ref]

[ref]: https://example.com "Example Title"

## Escapes

\*not italic\* and \_not italic\_.

## Horizontal Rule

---

## HTML (Should Be Blocked)

<div>This should be sanitized and not rendered as raw HTML.</div>
