import * as vscode from "vscode";

export interface ExtensionConfiguration {
  mesonPath: string;
  configureOnOpen: boolean;
  configureOptions: string[];
  buildFolder: string;
}
