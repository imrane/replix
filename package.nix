{ lib
, stdenv
, bun
, makeWrapper
, src ? ./.
}:

stdenv.mkDerivation {
  pname = "replix";
  version = "0.1.0";

  inherit src;

  nativeBuildInputs = [ makeWrapper ];

  buildInputs = [ bun ];

  installPhase = ''
    mkdir -p $out/share/replix
    cp -r src $out/share/replix/
    cp -r fixtures $out/share/replix/
    cp package.json tsconfig.json $out/share/replix/

    mkdir -p $out/bin
    makeWrapper ${bun}/bin/bun $out/bin/replix \
      --add-flags "$out/share/replix/src/index.ts" \
      --set NODE_ENV production
  '';

  meta = with lib; {
    description = "Auto-inject agent skills and MCP servers into Claude Code";
    homepage = "https://github.com/imrane/replix";
    license = licenses.mit;
    platforms = platforms.unix;
  };
}
