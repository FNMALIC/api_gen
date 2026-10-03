#!/usr/bin/env node
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerParser = require('swagger-parser');
const path = require('path');
const { ensureDirSync, capitalizeFirstLetter, mapTypeToTS } = require('../utils/helpers');
const { generateAxiosInstanceFile, generateAPIFunctions, writeAPIFiles } = require('../generators/apiGenerator');
const { generateReactQueryHooks } = require('../generators/hooksGenerator');
const { generateCRUDDashboard, SHADCN_COMPONENTS } = require('../generators/dashboardGenerator');

const inputFilePath = process.argv[2] || './schema.yaml'; 
const outputDir = process.argv[3] || './src'; 

async function generateAPI() {
    try {
        const fileContents = fs.readFileSync(inputFilePath, 'utf8');
        const swaggerDoc = yaml.load(fileContents);
        const parsedSchema = await swaggerParser.validate(swaggerDoc);
        const paths = parsedSchema.paths;
        const components = parsedSchema.components || {};

        const apiFolder = `${outputDir}/api`;
        const utilsFolder = `${outputDir}/utils`;
        const typesFolder = `${outputDir}/types`;
        const hooksFolder = `${outputDir}/hooks`;
        const pagesFolder = `${outputDir}/pages`;

        ensureDirSync(apiFolder);
        ensureDirSync(utilsFolder);
        ensureDirSync(typesFolder);
        ensureDirSync(hooksFolder);
        ensureDirSync(pagesFolder);

        generateAxiosInstanceFile(utilsFolder);
        const { apiMethodsByModel, interfaces, methodsByModel, fieldsByModel } = generateAPIFunctions(paths, components);
        writeAPIFiles(apiMethodsByModel, interfaces, apiFolder, typesFolder);
        generateReactQueryHooks(methodsByModel, hooksFolder);
        generateCRUDDashboard(methodsByModel, fieldsByModel, pagesFolder);

        console.log("API, TypeScript interfaces, hooks, and shadcn/ui dashboard generated successfully!");
        console.log("\nThe dashboard uses shadcn/ui. In your app, run:");
        console.log(`  npx shadcn@latest add ${SHADCN_COMPONENTS.join(' ')}`);
    } catch (error) {
        console.error("Error generating files:", error);
    }
}

generateAPI();
