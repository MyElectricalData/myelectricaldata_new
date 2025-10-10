"""Script pour remplacer tous les print() par des appels logger appropriés."""
import re
from pathlib import Path

# Règles de catégorisation
PATTERNS = {
    'INFO': [
        r'Successfully',
        r'✓',
        r'Starting',
        r'Received \d+',
        r'Updated \d+',
        r'created',
        r'Commit effectué',
        r'API Configuration',
        r'Background tasks started',
        r'authenticated successfully',
    ],
    'WARNING': [
        r'⚠',
        r'Skipping',
        r'Warning',
        r'Could not',
        r'Impossible',
        r'No token provided',
        r'PDL ignoré',
        r'rate limit',
        r'need to wait',
    ],
    'ERROR': [
        r'✗',
        r'ERROR',
        r'Failed',
        r'Error',
        r'ERREUR',
        r'not found',
        r'Authentication failed',
    ],
    'DEBUG': [
        r'Request',
        r'Response',
        r'Headers',
        r'Query params',
        r'Body data',
        r'Traitement',
        r'client_id',
        r'Verifying',
        r'MIDDLEWARE',
        r'AUTH\]',
        r'TOKEN\]',
        r'CONSENT\]',
    ],
}

def categorize_log_level(print_content: str) -> str:
    """Détermine le niveau de log basé sur le contenu."""
    # Vérifier les patterns
    for level, patterns in PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, print_content, re.IGNORECASE):
                return level

    # Par défaut INFO
    return 'INFO'

def process_file(file_path: Path):
    """Traite un fichier Python pour remplacer les prints."""
    print(f"\n📄 Processing {file_path.relative_to(Path.cwd())}")

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    changes = []

    # Check if logger is imported
    has_logger_import = 'import logging' in content
    has_logger_instance = re.search(r'logger\s*=\s*logging\.getLogger', content)

    # Find all print statements
    print_pattern = r'(\s*)print\((.*?)\)(?:\s*#.*)?$'

    lines = content.split('\n')
    new_lines = []

    for i, line in enumerate(lines, 1):
        match = re.search(print_pattern, line)
        if match:
            indent = match.group(1)
            print_args = match.group(2)

            # Déterminer le niveau
            level = categorize_log_level(print_args)

            # Conversion en logger call
            if print_args.startswith('f"') or print_args.startswith("f'"):
                # f-string: convertir en % formatting
                # Simplification: garder le f-string pour l'instant
                log_line = f'{indent}logger.{level.lower()}({print_args})'
            else:
                log_line = f'{indent}logger.{level.lower()}({print_args})'

            changes.append({
                'line': i,
                'old': line.strip(),
                'new': log_line.strip(),
                'level': level
            })

            new_lines.append(log_line)
        else:
            new_lines.append(line)

    if not changes:
        print("  ✓ No prints found")
        return

    # Ajouter les imports si nécessaire
    if not has_logger_import:
        # Trouver où insérer import logging
        import_index = 0
        for i, line in enumerate(new_lines):
            if line.startswith('import ') or line.startswith('from '):
                import_index = i + 1
        new_lines.insert(import_index, 'import logging')
        print(f"  + Added 'import logging' at line {import_index + 1}")

    if not has_logger_instance:
        # Trouver où insérer logger = logging.getLogger
        # Après les imports, avant les fonctions/classes
        insert_index = 0
        for i, line in enumerate(new_lines):
            if line and not line.startswith('import ') and not line.startswith('from ') and not line.startswith('#'):
                insert_index = i
                break

        module_name = f'__{file_path.stem}__'
        new_lines.insert(insert_index, '')
        new_lines.insert(insert_index + 1, f'logger = logging.getLogger(__name__)')
        new_lines.insert(insert_index + 2, '')
        print(f"  + Added logger instance at line {insert_index + 2}")

    # Écrire le résultat
    new_content = '\n'.join(new_lines)

    print(f"  📊 Found {len(changes)} print statements:")
    level_counts = {}
    for change in changes:
        level = change['level']
        level_counts[level] = level_counts.get(level, 0) + 1

    for level, count in sorted(level_counts.items()):
        print(f"     {level}: {count}")

    # Afficher quelques exemples
    print("  📝 Examples:")
    for change in changes[:3]:
        print(f"     L{change['line']}: {change['level']}")
        print(f"        - {change['old'][:80]}")
        print(f"        + {change['new'][:80]}")

    return new_content, len(changes)

def main():
    """Point d'entrée principal."""
    src_dir = Path(__file__).parent.parent / 'src'

    print("🔍 Scanning for Python files with print statements...")
    print(f"📁 Source directory: {src_dir}")

    python_files = list(src_dir.rglob('*.py'))
    print(f"📚 Found {len(python_files)} Python files")

    total_changes = 0
    files_modified = 0

    for py_file in python_files:
        result = process_file(py_file)
        if result:
            new_content, changes_count = result
            total_changes += changes_count
            files_modified += 1

            # Écrire les changements
            with open(py_file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"  ✅ File updated!")

    print(f"\n" + "="*60)
    print(f"📊 SUMMARY")
    print(f"="*60)
    print(f"Files with prints: {files_modified}")
    print(f"Total print statements: {total_changes}")
    print(f"\n✅ All files have been updated!")
    print(f"Run 'docker restart myelectricaldata-backend' to apply changes")

if __name__ == '__main__':
    main()
