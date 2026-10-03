#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/home/ramin/backups/keyboard-sensei}
COMPOSE_PROJECT=${COMPOSE_PROJECT:-keyboard-sensei}
DATE=${DATE:-$(date +%Y-%m-%d_%H%M)}

mkdir -p "$BACKUP_DIR"
created=()
tmp_files=()
cleanup() {
  for file in "${tmp_files[@]}"; do
    rm -f -- "$file"
  done
}
trap cleanup EXIT

# Dump to a temporary path so interrupted dumps cannot appear to be valid backups.
db_file="$BACKUP_DIR/ks-db-$DATE.dump"
db_tmp="$db_file.tmp.$$"
tmp_files+=("$db_tmp")
docker exec keyboard-sensei-postgres-1 pg_dump -U keyboard_sensei -Fc keyboard_sensei > "$db_tmp"
if [[ ! -s "$db_tmp" ]]; then
  echo "Database dump is empty: $db_tmp" >&2
  exit 1
fi
mv -- "$db_tmp" "$db_file"
created+=("$db_file")

volumes=(
  keyboard-sensei-instruments
  keyboard-sensei-midi-library
  keyboard-sensei-feedback-screenshots
  keyboard-sensei-caddy-data
)
for volume in "${volumes[@]}"; do
  name=${volume#keyboard-sensei-}
  archive="$BACKUP_DIR/ks-$name-$DATE.tar.gz"
  archive_tmp="$archive.tmp.$$"
  tmp_files+=("$archive_tmp")
  docker run --rm \
    -v "$COMPOSE_PROJECT"_"$volume":/src:ro \
    -v "$BACKUP_DIR":/out \
    alpine tar -czf "/out/$(basename "$archive_tmp")" -C /src .
  if [[ ! -s "$archive_tmp" ]]; then
    echo "Volume archive is empty: $archive_tmp" >&2
    exit 1
  fi
  mv -- "$archive_tmp" "$archive"
  created+=("$archive")
done

if [[ -n "${MIRROR_DIR:-}" && -d "$MIRROR_DIR" ]]; then
  if command -v rsync >/dev/null 2>&1; then
    rsync -a -- "${created[@]}" "$MIRROR_DIR/"
  else
    cp -p -- "${created[@]}" "$MIRROR_DIR/"
  fi
fi

for prefix in ks-db ks-instruments ks-midi-library ks-feedback-screenshots ks-caddy-data; do
  mapfile -t old_files < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$prefix-*" -printf '%f\n' | sort -r | tail -n +15)
  for old in "${old_files[@]}"; do
    rm -f -- "$BACKUP_DIR/$old"
  done
done

summary=()
for file in "${created[@]}"; do
  summary+=("$(basename "$file") $(du -h "$file" | cut -f1)")
done
printf 'Backup complete: %s\n' "$(IFS='; '; echo "${summary[*]}")"
