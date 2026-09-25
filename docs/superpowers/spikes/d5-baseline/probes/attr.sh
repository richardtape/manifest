#!/bin/bash
# Does an in-tree .gitattributes (-diff / binary) hide a file's added lines from `git log -p`
# in a BARE repository, and in a pre-receive hook's quarantine? And what does --cc show?
set -u
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
T=$(mktemp -d); cd $T
G="-c user.name=t -c user.email=t@t -c commit.gpgsign=false"
git init -q --bare -b main bare.git
git init -q -b main work; cd work
printf 'secret.txt -diff\nhidden.bin binary\n' > .gitattributes
printf 'line1\nKEY=AKIAABCDEFGHIJKLMNOP\n' > secret.txt
printf 'x\nAKIAABCDEFGHIJKLMNOQ\n' > hidden.bin
printf 'plain\nAKIAABCDEFGHIJKLMNOR\n' > plain.txt
git add -A; git $G commit -qm one
git push -q ../bare.git main
cd ..
echo "== git version: $(git --version)"
echo "== bare repo, git log -p (default attributes):"
git --git-dir bare.git log -p -U0 --no-color --no-ext-diff --no-renames --format=%x00%H main | tr '\0' '@' | grep -n 'AKIA\|Binary\|+++'
echo "== bare repo, with -c attr.tree=4b825dc642cb6eb9a060e54bf8d69288fbee4904 (empty tree):"
git --git-dir bare.git -c attr.tree=4b825dc642cb6eb9a060e54bf8d69288fbee4904 log -p -U0 --no-color --no-ext-diff --format=%x00%H main | tr '\0' '@' | grep -n 'AKIA\|Binary\|+++'
echo "== a NON-bare work tree (for comparison):"
git -C work log -p -U0 --no-color --format=%x00%H main | tr '\0' '@' | grep -n 'AKIA\|Binary\|+++'
echo "== info/attributes in the bare repo (* diff) overriding:"
mkdir -p bare.git/info; printf '* diff\n' > bare.git/info/attributes
git --git-dir bare.git log -p -U0 --no-color --format=%x00%H main | tr '\0' '@' | grep -n 'AKIA\|Binary\|+++'
rm bare.git/info/attributes
echo "== --text:"
git --git-dir bare.git log -p --text -U0 --no-color --format=%x00%H main | tr '\0' '@' | grep -n 'AKIA\|Binary\|+++'
# evil merge
cd work
git checkout -q -b side; printf 'side\n' > side.txt; git add -A; git $G commit -qm side
git checkout -q main; printf 'mainline\n' > m.txt; git add -A; git $G commit -qm mainline
git merge -q --no-commit side 2>/dev/null; printf 'evil\nAKIAEVILEVILEVILEVIL\n' > evil.txt; printf 'side\nAKIASIDESIDESIDESIDE\n' >> side.txt ; git add -A; git $G commit -qm merge
git push -q ../bare.git main
cd ..
echo "== merge, default -p (no merge diff):"
git --git-dir bare.git log -p -U0 --no-color --format=%x00%H main -3 | tr '\0' '@' | grep -n 'AKIA\|^@\|+++\|@@'
echo "== merge, --cc:"
git --git-dir bare.git log -p --cc -U0 --no-color --format=%x00%H main -3 | tr '\0' '@' | grep -n 'AKIA\|^@\|+++\|@@'
rm -rf $T
