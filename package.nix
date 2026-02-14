{ lib
, stdenv
, bun
, makeWrapper
, src ? ./.
}:

stdenv.mkDerivation {
  pname = "nexus";
  version = "0.1.0";

  inherit src;

  nativeBuildInputs = [ makeWrapper ];

  buildInputs = [ bun ];

  installPhase = ''
    mkdir -p $out/share/nexus
    cp -r src $out/share/nexus/
    cp -r fixtures $out/share/nexus/
    cp package.json tsconfig.json $out/share/nexus/

    mkdir -p $out/bin
    makeWrapper ${bun}/bin/bun $out/bin/nexus \
      --add-flags "$out/share/nexus/src/index.ts" \
      --set NODE_ENV production
  '';

  meta = with lib; {
    description = "Auto-inject agent skills and MCP servers into Claude Code";
    homepage = "https://github.com/imrane/nexus";
    license = licenses.mit;
    platforms = platforms.unix;
  };
}
