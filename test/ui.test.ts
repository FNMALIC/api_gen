import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fill, generateThemeCss, resolveUi, applyResourceOptions, LOCALES } from '../src/ui.ts';
import { loadSpec, buildModels } from '../src/spec.ts';
import { createTypeContext } from '../src/generators/types.ts';
import { FIXTURES } from './helpers.ts';

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
    // More specific than shadcn's own :root/.dark, so the order of the CSS files doesn't matter
    assert.match(css, /:root:not\(\.dark\) \{[^}]*--primary: #facc15;/);
    assert.match(css, /--primary-foreground: #0a0a0a;/, 'dark text on a light yellow');
    assert.match(css, /--destructive: oklch\(0\.58 0\.22 27\);/);
    assert.match(css, /--radius: 0\.25rem;/);
    assert.match(css, /:root\.dark \{[^}]*--primary: #facc15;/, 'the primary color carries over to dark mode');
    assert.doesNotMatch(css.slice(css.indexOf(':root.dark')), /destructive/, 'light-only colors stay out of dark mode');
    assert.match(css, /font-family: Inter, sans-serif;/);
    assert.match(generateThemeCss({ colors: { primary: '#1e3a8a' } })!, /--primary-foreground: #fafafa;/, 'light text on dark blue');
});

test('applies the design: labels, columns, fields, actions, sidebar order, and warns about unknown names', async () => {
    const api = await loadSpec(path.join(FIXTURES, 'wrapped.yaml'));
    const built = buildModels(api, createTypeContext(api));
    const ui = resolveUi(
        {
            nav: ['roles', 'users', 'nope'],
            resources: {
                users: {
                    label: 'Utilisateurs',
                    description: 'Comptes',
                    columns: ['name', 'active', 'missing'],
                    fields: { nickname: { label: 'Surnom', order: 0, help: 'Aide', placeholder: 'ex. Bob', widget: 'textarea' }, ghost: { label: 'x' } },
                    actions: { resetUserPassword: { hidden: true }, setUserStatus: { label: 'Changer le statut' }, unknownAction: {} },
                },
                auth: { fields: { email: { label: 'Adresse e-mail' } } },
                userz: { label: 'typo' },
            },
        },
        undefined
    );
    const { models, login, warnings } = applyResourceOptions(built.models, ui, built.login);
    const users = models.find(model => model.key === 'users')!;

    assert.deepEqual(models.slice(0, 2).map(model => model.key), ['roles', 'users'], 'nav order first');
    assert.equal(users.pluralLabel, 'Utilisateurs');
    assert.equal(users.description, 'Comptes');
    assert.deepEqual(users.tableColumns, ['name', 'active', 'missing']);
    const nickname = users.formFields[0];
    assert.deepEqual(
        { name: nickname.name, label: nickname.label, description: nickname.description, placeholder: nickname.placeholder, widget: nickname.widget },
        { name: 'nickname', label: 'Surnom', description: 'Aide', placeholder: 'ex. Bob', widget: 'textarea' },
        'order: 0 moves it first'
    );
    assert.equal(users.actions.find(action => action.Name === 'ResetUserPassword')?.hidden, true);
    assert.equal(users.actions.find(action => action.Name === 'SetUserStatus')?.label, 'Changer le statut');
    assert.equal(login?.fields.find(field => field.name === 'email')?.label, 'Adresse e-mail');

    assert.deepEqual(warnings.map(warning => warning.split(':')[0]).sort(), [
        'ui.nav',
        'ui.resources.users.actions.unknownAction',
        'ui.resources.users.columns',
        'ui.resources.users.fields.ghost',
        'ui.resources.userz',
    ]);
});
