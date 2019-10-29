import * as vscode from "vscode";
import { createHash } from "crypto";

export class BaseNode {
  static count: number = 0;
  public readonly id: string;
  constructor(public readonly label: string) {
    const hash = createHash("sha1");
    hash.update(label);
    hash.update((BaseNode.count++).toFixed());
    this.id = hash.digest("base64");
    hash.destroy();
  }
  getChildren(): vscode.ProviderResult<BaseNode[]> {
    return [];
  }
  getTreeItem(): vscode.ProviderResult<vscode.TreeItem> {
    const item = new vscode.TreeItem(this.id);
    item.id = this.id;
    item.label = this.label;
    return item;
  }
}
