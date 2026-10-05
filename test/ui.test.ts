import test from 'node:test';
import assert from 'node:assert/strict';
import { fill, generateThemeCss, resolveUi, LOCALES } from '../src/ui.ts';

test('resolves UI options with defaults', () => {
    const ui = resolveUi(undefined, 'Shop API');
    assert.equal(ui.title, 'Shop API');
    assert.equal(ui.pageSize, 10);
    assert.equal(ui.darkModeToggle, true);
    assert.equal(ui.strings.addNew, 'Add new');

    const fr = resolveUi({ locale: 'fr', labels: { addNew: 'Nouveau' }, title: 'BO', pageSize: 25 }, 'Shop API');
    assert.equal(fr.title, 'BO');
    assert.equal(fr.pageSize, 25);
    assert.equal(fr.strings.addNew, 'Nouveau', 'labels override the locale');
    assert.equal(fr.strings.save, 'Enregistrer');

    assert.throws(() => resolveUi({ locale: 'xx' as 'fr' }, undefined), /Unknown locale/);
    assert.throws(() => resolveUi({ pageSize: 0 }, undefined), /pageSize/);
});

test('every locale has every string', () => {
    const keys = Object.keys(LOCALES.en).sort();
    for (const [locale, strings] of Object.entries(LOCALES)) assert.deepEqual(Object.keys(strings).sort(), keys, locale);
});

test('fills placeholders', () => {
    assert.equal(fill('Page {page} of {count}', { page: 2, count: 5 }), 'Page 2 of 5');
    assert.equal(fill('Keep {unknown}', {}), 'Keep {unknown}');
});

test('writes theme CSS with readable text on the primary color', () => {
    assert.equal(generateThemeCss({}), null);
    const css = generateThemeCss({ colors: { primary: '#facc15', destructive: 'oklch(0.58 0.22 27)' }, radius: '0.25rem', font: 'Inter, sans-serif' })!;
    assert.match(css, /:root \{[^}]*--primary: #facc15;/);
    assert.match(css, /--primary-foreground: #0a0a0a;/, 'dark text on a light yellow');
    assert.match(css, /--destructive: oklch\(0\.58 0\.22 27\);/);
    assert.match(css, /--radius: 0\.25rem;/);
    assert.match(css, /\.dark \{[^}]*--primary: #facc15;/, 'the primary color carries over to dark mode');
    assert.match(css, /font-family: Inter, sans-serif;/);
    assert.match(generateThemeCss({ colors: { primary: '#1e3a8a' } })!, /--primary-foreground: #fafafa;/, 'light text on dark blue');
});
