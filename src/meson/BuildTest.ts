import MesonBuildDir from "./BuildDir";
import { Test } from "./types";
import { execAsTask } from "../utils";
import { TaskRevealKind, Task, ProcessExecution, TaskGroup } from "vscode";

export default class MesonBuildTest {
  constructor(private builder: MesonBuildDir, private _test: Test) { }

  public get test() {
    return this._test;
  }
  public get name() {
    return this.test.name;
  }
  public get executable() {
    return this.test.cmd[0]
  }
  public get arguments() {
    return this.test.cmd.slice(1);
  }
  public get commandLine() {
    return `${this.executable} ${this.arguments.filter(Boolean).map(a => `"${a}"`).join(" ")}`;
  }

  public async run() {
    return execAsTask(this.commandLine, { cwd: this.builder.sourceDir }, TaskRevealKind.Always);
  }

  public getRunTask(): Task {
    const task = new Task(
      { type: "meson", mode: "test", name: this.name },
      `Test ${this.name}`,
      "Meson",
      new ProcessExecution(this.executable, this.arguments, { cwd: this.builder.sourceDir })
    );
    task.group = TaskGroup.Test;
    return task;
  }
}
