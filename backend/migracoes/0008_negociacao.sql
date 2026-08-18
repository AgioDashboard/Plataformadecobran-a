-- Estagio da negociacao progressiva por divida: 0 = nenhuma oferta feita
-- ainda; 1/2/3 = qual degrau (50%/75%/100% do teto) foi revelado por
-- ultimo. valor_acordado_centavos so e preenchido quando o cliente aceita
-- um valor e a divida vira 'negociada' (situacao ja suportava esse estado).
ALTER TABLE dividas ADD COLUMN estagio_negociacao INTEGER NOT NULL DEFAULT 0
  CHECK (estagio_negociacao >= 0 AND estagio_negociacao <= 3);
ALTER TABLE dividas ADD COLUMN valor_acordado_centavos INTEGER;
