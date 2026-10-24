# Restore Midivory backups

Restore the PostgreSQL custom-format dump while the API is stopped or in maintenance:

```sh
docker exec -i keyboard-sensei-postgres-1 pg_restore -U keyboard_sensei -d keyboard_sensei --clean --if-exists < ks-db-YYYY-MM-DD_HHMM.dump
```

Restore a volume archive into its existing Docker volume (replace the volume and archive names as needed):

```sh
docker run --rm -i -v keyboard-sensei_keyboard-sensei-instruments:/dst alpine sh -c 'cd /dst && tar -xzf -' < ks-instruments-YYYY-MM-DD_HHMM.tar.gz
```

Repeat for `keyboard-sensei-midi-library`, `keyboard-sensei-feedback-screenshots`, and `keyboard-sensei-caddy-data`. The Caddy data volume contains the LAN CA root; restoring it preserves device trust.

Suggested server crontab entry:

```cron
30 3 * * * /home/<user>/apps/keyboard-sensei/scripts/backup-keyboard-sensei.sh >> /home/<user>/backups/keyboard-sensei/backup.log 2>&1
```
