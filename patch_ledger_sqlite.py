#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import re
import sys

TARGET = Path("/Users/jonyopenclaw/.openclaw/workspace/skills/openclaw-dashboard/api-server.js")

def main():
    if not TARGET.exists():
        print(f"ERROR: file not found: {TARGET}")
        sys.exit(1)

    s = TARGET.read_text(encoding="utf-8")
    original = s
    # 0) 备份
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = TARGET.with_name(f"api-server.js.bak.{ts}")
    bak.write_text(s, encoding="utf-8")
    print(f"[ok] backup => {bak}")

    # 1) LEDGER_DB_FILE fallback 链
    pattern1 = r"const\s+LEDGER_DB_FILE\s*=\s*process\.env\.OPENCLAW_LEDGER_DB\s*\|\|\s*path\.join\(HOME_DIR,\s*'\.openclaw',\s*'ledger\.db'\);"
    replace1 = (
        "const LEDGER_DB_FILE =\n"
        "  process.env.LEDGER_DB_PATH ||\n"
        "  process.env.OPENCLAW_LEDGER_DB ||\n"
        "  path.join(HOME_DIR, '.openclaw', 'ledger.db');"
    )
    s, n1 = re.subn(pattern1, replace1, s)
    print(f"[ok] replace LEDGER_DB_FILE lines: {n1}")

    # 2) helper 注入（若缺失）
    helper = """
function runSqliteJson(dbFile, sql) {
  if (!fs.existsSync(dbFile)) {
    const err = new Error(`Ledger DB not found: ${dbFile}`);
    err.code = 'LEDGER_DB_NOT_FOUND';
    throw err;
  }
  try {
    const out = execFileSync('sqlite3', [dbFile, '-json', sql], { encoding: 'utf8' });
    return out && out.trim() ? JSON.parse(out) : [];
  } catch (e) {
    const msg = (e && (e.stderr || e.message)) ? String(e.stderr || e.message) : 'sqlite3 failed';
    const err = new Error(msg.trim());
    err.code = 'SQLITE3_FAILED';
    err.dbFile = dbFile;
    throw err;
  }
}
""".strip("\n")

    if "function runSqliteJson(" not in s:
        anchor = "path.join(HOME_DIR, '.openclaw', 'ledger.db');"
        idx = s.find(anchor)
        if idx != -1:
            insert_at = s.find("\n", idx)
            s = s[:insert_at+1] + "\n" + helper + "\n\n" + s[insert_at+1:]
            print("[ok] helper injected after LEDGER_DB_FILE")
        else:
            s = helper + "\n\n" + s
            print("[warn] anchor not found, helper prepended")
    else:
        print("[ok] helper already exists")

    # 3) 替换 direct sqlite3 calls -> helper
    before_calls = s.count("execFileSync('sqlite3'")
    s = s.replace(
        "const out = execFileSync('sqlite3', [dbFile, '-json', sql], { encoding: 'utf8' });",
        "const rows = runSqliteJson(dbFile, sql);"
    )
    s = s.replace(
        "const out = execFileSync('sqlite3', [LEDGER_DB_FILE, '-json', sql], { encoding: 'utf8' });",
        "const rows = runSqliteJson(LEDGER_DB_FILE, sql);"
    )
    s = s.replace("const rows = JSON.parse(out || '[]');", "/* rows already parsed by runSqliteJson */")
    s = s.replace("return JSON.parse(out || '[]');", "return rows;")
    after_calls = s.count("execFileSync('sqlite3'")

    # 写回
    TARGET.write_text(s, encoding="utf-8")
    print(f"[ok] sqlite3 direct calls before={before_calls}, after={after_calls}")
    # 4) 结果提示
    if s == original:
        print("[info] no text changes made (maybe already patched)")
    print("\n=== verify ===")
    for i, line in enumerate(s.splitlines(), start=1):
        if "LEDGER_DB_FILE" in line or "runSqliteJson(" in line or "execFileSync('sqlite3'" in line:
            print(f"{i}: {line}")

if __name__ == "__main__":
    main()