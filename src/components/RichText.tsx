import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { F } from '../theme';
import { parseRich } from '../richText';

interface Props {
  /** Texte balisé (**gras**, __souligné__). */
  text: string;
  style?: StyleProp<TextStyle>;
  /**
   * Style du gras. Par défaut la famille MontserratBold — `fontWeight` est
   * ignoré par iOS sur une police custom, chaque graisse étant une famille.
   * À surcharger (ex. `fontWeight: '700'`) quand le texte autour est rendu avec
   * la police système, qui, elle, comprend les graisses.
   */
  boldStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/** Affiche dans l'app un commentaire balisé, tel qu'il sortira à l'export. */
export function RichText({ text, style, boldStyle, numberOfLines }: Props) {
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parseRich(text).map((run, i) => (
        <Text
          key={i}
          style={[
            run.bold && (boldStyle ?? styles.bold),
            run.underline && styles.underline,
          ]}
        >
          {run.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: { fontFamily: F.monoBold },
  underline: { textDecorationLine: 'underline' },
});
