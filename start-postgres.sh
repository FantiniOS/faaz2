#!/bin/sh
mount | grep -q '/var/lib/postgresql/data' || mount -o loop /mnt/host/c/Users/Fantini/pgdata.img /var/lib/postgresql/data
mkdir -p /run/postgresql
chown -R postgres:postgres /run/postgresql
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /var/lib/postgresql/data/db/postgresql.conf
echo "host all all 0.0.0.0/0 trust" >> /var/lib/postgresql/data/db/pg_hba.conf
echo "host all all ::0/0 trust" >> /var/lib/postgresql/data/db/pg_hba.conf
exec su - postgres -c "postgres -D /var/lib/postgresql/data/db"
