import MesonBuildDir from "./BuildDir";
import { Target, TargetType, TargetSource } from "./types";
import { execAsTask, extensionConfiguration, arrayIncludes, thisExtension } from "../utils";
import { runNinjaTask } from "./utils";
import { Task, ShellExecution, ProcessExecution, TaskGroup, workspace } from "vscode";

export default class MesonBuildTarget {
  public static async fromTargetName(builder: MesonBuildDir, target: string) {
    const targets = await builder.getTargets();
    return targets.find(t => t.name === target);
  }
  constructor(private builder: MesonBuildDir, private _target: Target) { }

  public get id() { return this.target.id }
  public get name() { return this.target.name }
  public get type() { return this.target.type }
  public get target() { return this._target }

  public get isExecutable() {
    return arrayIncludes<TargetType>(["executable", "run", "jar"], this.type)
  }

  public async build() {
    return this.builder.build(this.name);
  }

  public getBuildTask(): Task {
    const ninjaPath = extensionConfiguration("ninjaPath");
    const task = new Task(
      { type: "meson", mode: "build", target: this.id },
      `Build ${this.name}`,
      "Meson",
      new ProcessExecution(ninjaPath, [this.name], { cwd: this.builder.buildDir })
    );
    task.group = TaskGroup.Build;
    return task;
  }

  public getRunTask(): Task | null {
    if (!this.isExecutable) return null;
    const task = new Task(
      { type: "meson", mode: "run", target: this.id },
      `Run ${this.id}`,
      "Meson",
      new ProcessExecution(this.target.filename[0], { cwd: workspace.rootPath })
    );
    task.group = TaskGroup.Test;
    return task;
  }
}
