#!/usr/bin/env node

import { Command } from "commander";
import { scanCommand } from "./commands/scan.js";

const program = new Command();

program
    .name("repo-compass")
    .description("Deterministic documentation and onboarding for modern repositories.")
    .version("0.1.0");

program.addCommand(scanCommand);

program.parse();
