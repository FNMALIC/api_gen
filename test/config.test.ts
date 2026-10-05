import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { loadConfig, validateConfig, createDesignFile } from '../src/config.ts';
import { generate } from '../src/index.ts';
import { FIXTURES, tmpDir } from './helpers.ts';

test('loads a YAML design file and resolves its paths', async () => {
    const config = await loadConfig(path.join(FIXTURES, 'wrapped.design.yaml'));
    assert.equal(config.input, path.join(FIXTURES, 'wrapped.yaml'));
    assert.equal(config.ui?.locale, 'fr');
    assert.deepEqual(config.ui?.resources?.users?.columns, ['name', 'nickname', 'active']);
    assert.ok(!('$schema' in config));
});

test('finds api-gen.config.yaml in the current directory', async () => {
    const dir = tmpDir('find-config');
    fs.writeFileSync(path.join(dir, 'api-gen.config.yaml'), 'router: next\nui:\n  pageSize: 20\n');
    const config = await loadConfig(undefined, dir);
    assert.equal(config.router, 'next');
    assert.equal(config.ui?.pageSize, 20);
});

test('rejects mistakes with one readable line each, suggesting the intended name', () => {
    assert.throws(
        () =>
            validateConfig(
                {
                    rooter: 'next',
                    ui: { locale: 'es', pageSize: 'ten', resources: { users: { colums: ['name'], fields: { name: { lable: 'Nom', widget: 'wysiwyg' } } } } },
                },
                'api-gen.config.yaml'
            ),
        (error: Error) => {
            assert.equal(
                error.message,
                [
                    'api-gen.config.yaml is invalid:',
                    '  rooter: unknown option (did you mean "router"?)',
                    '  ui.locale: must be one of "en", "fr"',
                    '  ui.pageSize: must be integer',
                    '  ui.resources.users.colums: unknown option (did you mean "columns"?)',
                    '  ui.resources.users.fields.name.lable: unknown option (did you mean "label"?)',
                    '  ui.resources.users.fields.name.widget: must be one of "text", "textarea", "password", "email", "url", "date", "datetime"',
                ].join('\n')
            );
            return true;
        }
    );
});

test('reports invalid YAML with its location', async () => {
    const dir = tmpDir('bad-yaml');
    fs.writeFileSync(path.join(dir, 'api-gen.config.yaml'), 'ui:\n  title: [unclosed\n');
    await assert.rejects(loadConfig(undefined, dir), /api-gen\.config\.yaml is not valid YAML: .*line/);
});

test('init writes a design file listing resources, columns, fields and actions, which generates without warnings', async () => {
    const dir = tmpDir('init');
    const yaml = await createDesignFile(path.join(FIXTURES, 'wrapped.yaml'), { configDir: dir });
    assert.match(yaml, /^# yaml-language-server: \$schema=https:\/\/unpkg\.com\/api-gen-package\/config\.schema\.json/);
    const design = YAML.parse(yaml);
    validateConfig(design);
    assert.deepEqual(design.ui.nav, ['users', 'roles', 'teams', 'events']);
    assert.deepEqual(design.ui.resources.users.columns, ['name', 'nickname', 'active', 'id']);
    assert.deepEqual(design.ui.resources.users.actions.setUserStatus, { label: 'Set status' });
    assert.deepEqual(Object.keys(design.ui.resources.auth.fields), ['email', 'password'], 'the login form is designable too');

    fs.writeFileSync(path.join(dir, 'api-gen.config.yaml'), yaml);
    const config = await loadConfig(undefined, dir);
    const { warnings } = await generate({ ...config, input: config.input!, output: path.join(dir, 'src'), format: false });
    assert.deepEqual(warnings.filter(warning => warning.startsWith('ui.')), []);
});
