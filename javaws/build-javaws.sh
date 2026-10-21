#!/bin/bash
# build-javaws.sh -- build Java Web Start for the WebAssembly runtime:
# IcedTea-Web's NetX (javaws), compiled against the target class library
# into openjdk8-javaws.jar.  The browser loader (OpenJDK8.runJNLP and links to
# .jnlp files) and the node launcher (openjdk8-javaws) put it on the boot
# class path and run net.sourceforge.jnlp.runtime.Boot, as IcedTea-Web's own
# javaws launcher does.
#
# usage: build-javaws.sh ICEDTEA_WEB_SRC JRE_IMAGE OUT_JAR
#   ICEDTEA_WEB_SRC  IcedTea-Web 1.8 source tree (a release archive)
#   JRE_IMAGE        the JRE image built for the target (lib/rt.jar, lib/ext)
# environment: JAVA_HOME_BUILD (the JDK 8 whose javac and jar are used)
#
# NetX is built without its optional dependencies, as IcedTea-Web's configure
# does when they are missing: no TagSoup (MalformedXMLParser: malformed JNLP
# files are rejected), no Rhino (RhinoBasedPacEvaluator: proxy auto-config
# scripts are not evaluated), no mslinks (WindowsDesktopEntry).  Patches in
# javaws/patches/ are applied to it first (there are none at present).
set -euo pipefail
SRC=$(cd "$1" && pwd)
JRE=$(cd "$2" && pwd)
OUT=$3
SUPPORT=${SUPPORT:-$(cd "$(dirname "$0")/.." && pwd)}
JDK=${JAVA_HOME_BUILD:?JAVA_HOME_BUILD must point to a JDK 8}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

VERSION=$(sed -n 's/^AC_INIT(\[[^]]*\], *\[\([^]]*\)\].*/\1/p' "$SRC/configure.ac")
echo "build-javaws: IcedTea-Web ${VERSION:-?}"

cp -a "$SRC/netx" "$WORK/netx"
for p in "$SUPPORT"/javaws/patches/*.patch; do
  [ -e "$p" ] || continue
  echo "build-javaws: applying $(basename "$p")"
  patch -d "$WORK" -p1 < "$p"
done

find "$WORK/netx" -name '*.java' ! -name MalformedXMLParser.java \
  ! -name WindowsDesktopEntry.java ! -name RhinoBasedPacEvaluator.java \
  | sort > "$WORK/sources.txt"
mkdir "$WORK/classes"
"$JDK/bin/javac" -nowarn -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$JRE/lib/rt.jar:$JRE/lib/jsse.jar:$JRE/lib/jce.jar" \
  -extdirs "$JRE/lib/ext" -sourcepath "$WORK/netx" -d "$WORK/classes" \
  @"$WORK/sources.txt"

# resources, as IcedTea-Web's Makefile installs them
R=net/sourceforge/jnlp
mkdir -p "$WORK/classes/$R/resources"
cp -R "$WORK/netx/$R/resources/." "$WORK/classes/$R/resources/"
cp "$WORK/netx/$R/runtime/pac-funcs.js" "$WORK/classes/$R/runtime/"
printf '# build-time settings\nrhino.available=false\n' > "$WORK/classes/$R/build.properties"
# AUTHORS/NEWS/COPYING/ChangeLog as HTML for the About dialog (javaws -about)
mkdir -p "$WORK/gen/html-gen"
cp "$SRC/html-gen.sh" "$WORK/gen/"
cp "$SRC/AUTHORS" "$SRC/NEWS" "$SRC/COPYING" "$SRC/ChangeLog" "$WORK/gen/html-gen/"
( cd "$WORK/gen" && bash html-gen.sh 140 > /dev/null )
cp "$WORK"/gen/html-gen/*.html "$WORK/classes/$R/resources/"

cat > "$WORK/manifest" <<EOF
Main-Class: net.sourceforge.jnlp.runtime.Boot
Implementation-Title: IcedTea-Web
Implementation-Version: $VERSION
Implementation-URL: http://icedtea.classpath.org/wiki/IcedTea-Web
Implementation-Vendor: IcedTea
Specification-Title: JSR56: Java Network Launching Protocol and API
Specification-Vendor: Java Community Process
Specification-Version: 6.0
EOF
mkdir -p "$(dirname "$OUT")"
"$JDK/bin/jar" cfm "$OUT" "$WORK/manifest" -C "$WORK/classes" .
echo "build-javaws: wrote $OUT ($(wc -c < "$OUT") bytes)"
