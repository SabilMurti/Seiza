import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import yaml from 'yaml';

export interface Skill {
  name: string;
  description: string;
  version?: string;
  author?: string;
  path: string;
  isGlobal: boolean;
  instructions: string;
}

export class SkillManager {
  private globalSkillsDir: string;
  private workspaceSkillsDir: string;

  constructor(workspaceDir: string = process.cwd()) {
    this.globalSkillsDir = path.join(os.homedir(), '.seiza', 'skills');
    this.workspaceSkillsDir = path.join(workspaceDir, 'skills');
    this.ensureDirs();
  }

  private ensureDirs() {
    if (!fs.existsSync(this.globalSkillsDir)) {
      fs.mkdirSync(this.globalSkillsDir, { recursive: true });
    }
    if (!fs.existsSync(this.workspaceSkillsDir)) {
      fs.mkdirSync(this.workspaceSkillsDir, { recursive: true });
    }
  }

  private parseSkillMd(filePath: string, isGlobal: boolean): Skill | null {
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (match) {
      const frontmatterStr = match[1];
      const body = match[2].trim();
      try {
        const data = yaml.parse(frontmatterStr);
        if (!data.name || !data.description) return null;
        return {
          name: data.name,
          description: data.description,
          version: data.version,
          author: data.author,
          path: path.dirname(filePath),
          isGlobal,
          instructions: body,
        };
      } catch (e) {
        console.error(`Failed to parse frontmatter in ${filePath}`, e);
        return null;
      }
    }
    return null;
  }

  private discoverSkillsInDir(dirPath: string, isGlobal: boolean): Skill[] {
    const skills: Skill[] = [];
    if (!fs.existsSync(dirPath)) return skills;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(dirPath, entry.name, 'SKILL.md');
        const skill = this.parseSkillMd(skillPath, isGlobal);
        if (skill) {
          skills.push(skill);
        }
      }
    }
    return skills;
  }

  public listSkills(): Skill[] {
    const globalSkills = this.discoverSkillsInDir(this.globalSkillsDir, true);
    const workspaceSkills = this.discoverSkillsInDir(this.workspaceSkillsDir, false);

    // Workspace skills override global skills with the same name
    const skillMap = new Map<string, Skill>();
    for (const skill of globalSkills) {
      skillMap.set(skill.name, skill);
    }
    for (const skill of workspaceSkills) {
      skillMap.set(skill.name, skill);
    }

    return Array.from(skillMap.values());
  }

  public installSkillFromGithub(repoSource: string): void {
    let repoUrl = repoSource;
    if (repoSource.startsWith('github:')) {
      repoUrl = `https://github.com/${repoSource.substring(7)}.git`;
    } else if (!repoSource.startsWith('http') && repoSource.includes('/')) {
      repoUrl = `https://github.com/${repoSource}.git`;
    }

    const repoName = repoSource.split('/').pop()?.replace('.git', '') || 'unknown-skill';
    const targetDir = path.join(this.globalSkillsDir, repoName);

    if (fs.existsSync(targetDir)) {
      this.deleteSkill(repoName);
    }

    console.log(`Cloning ${repoUrl} to ${targetDir}`);
    execSync(`git clone ${repoUrl} ${targetDir}`, { stdio: 'inherit' });
  }

  public installSkillFromPath(localPath: string): void {
    const resolvedPath = path.resolve(localPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Path ${localPath} does not exist`);
    }

    const skillName = path.basename(resolvedPath);
    const targetDir = path.join(this.globalSkillsDir, skillName);

    if (fs.existsSync(targetDir)) {
      this.deleteSkill(skillName);
    }

    execSync(`cp -R ${resolvedPath} ${targetDir}`);
  }

  public installSkill(source: string): void {
    if (source.startsWith('github:') || source.startsWith('http') || (source.includes('/') && !fs.existsSync(source))) {
        this.installSkillFromGithub(source);
    } else {
        this.installSkillFromPath(source);
    }
  }

  public deleteSkill(name: string): void {
    const targetDir = path.join(this.globalSkillsDir, name);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } else {
      throw new Error(`Skill ${name} not found in global skills dir`);
    }
  }

  public getSkillInstructions(name: string): string | null {
    const skills = this.listSkills();
    const skill = skills.find(s => s.name === name);
    return skill ? skill.instructions : null;
  }
}
