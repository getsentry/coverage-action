// Prism ships its language grammars as side-effect only scripts, and
// @types/prismjs does not declare them. Importing one only registers a grammar.
declare module "prismjs/components/*";
