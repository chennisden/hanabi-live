// CardLayout is an object that represents a player's hand (or a discard pile). It is composed of
// LayoutChild objects.

import Konva from "konva";
import { CARD_ANIMATION_LENGTH } from "./constants";
import globals from "./globals";
import HanabiCard from "./HanabiCard";
import { animate } from "./konvaHelpers";
import LayoutChild from "./LayoutChild";

export default class CardLayout extends Konva.Group {
  private align: string;
  private reverse: boolean;
  origRotation: number;
  empathy: boolean;

  constructor(config: Konva.ContainerConfig) {
    super(config);

    // Class variables.
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    this.align = (config["align"] || "left") as string;
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    this.reverse = (config["reverse"] || false) as boolean;
    this.origRotation = config.rotation ?? 0;
    this.empathy = false;

    if (config.width === undefined) {
      throw new Error("A width was not defined for a CardLayout.");
    }
    if (config.height === undefined) {
      throw new Error("A height was not defined for a CardLayout.");
    }

    // Debug rectangle (uncomment to show the size of the hand).
    /*
    const debugRect = new Konva.Rect({
      x: config.x,
      y: config.y,
      width: config.width,
      height: config.height,
      fill: 'black',
      rotation: config.rotation,
      listening: false,
    });
    globals.layers.UI.add(debugRect);
    */
  }

  // The card has a relative position relating to its location
  // (e.g. a player's hand, the play stacks). Use the absolute position so that we can tween it from
  // one location to another without having to worry about the relative position.
  addChild(child: LayoutChild): void {
    const pos = child.getAbsolutePosition();
    this.add(child as unknown as Konva.Group);
    child.setAbsolutePosition(pos);
    if (this.empathy) {
      child.card.setEmpathy(true);
    }
    this.doLayout();
  }

  override _setChildrenIndices(): void {
    Konva.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
  }

  doLayout(): void {
    // Local variables
    const handWidth = this.width();
    const handHeight = this.height();
    const numCards = this.children.length;

    let uw = 0;
    for (let i = 0; i < numCards; i++) {
      const layoutChild = this.children[i] as unknown as LayoutChild;

      if (layoutChild.height() <= 0) {
        continue;
      }

      const scale = handHeight / layoutChild.height();
      uw += scale * layoutChild.width();
    }

    let spacingBetweenCards = 0;
    if (numCards > 1) {
      spacingBetweenCards = (handWidth - uw) / (numCards - 1);
    }
    let maxSpacingBetweenCards = 0.04 * uw;
    if (globals.lobby.settings.keldonMode) {
      maxSpacingBetweenCards = 0.025 * uw;
    }
    if (spacingBetweenCards > maxSpacingBetweenCards) {
      spacingBetweenCards = maxSpacingBetweenCards;
    }
    uw += spacingBetweenCards * (numCards - 1);

    let x = 0;
    if (this.align === "center" && uw < handWidth) {
      x = (handWidth - uw) / 2;
    }
    if (this.reverse) {
      x = handWidth - x;
    }

    for (let i = 0; i < numCards; i++) {
      const layoutChild = this.children[i] as unknown as LayoutChild;

      // Ensure this card is not hidden at the bottom of a play stack.
      layoutChild.show();

      if (layoutChild.height() <= 0) {
        continue;
      }

      const scale = handHeight / layoutChild.height();

      if (layoutChild.tween !== null) {
        layoutChild.tween.destroy();
        layoutChild.tween = null;
      }

      const newX = x - (this.reverse ? scale * layoutChild.width() : 0);
      if (globals.animateFast) {
        // Immediately set the card in place at the new location.
        layoutChild.x(newX);
        layoutChild.y(0);
        layoutChild.scaleX(scale);
        layoutChild.scaleY(scale);
        layoutChild.rotation(0);
        layoutChild.opacity(1);
        layoutChild.checkSetDraggable();
        layoutChild.card.setRaiseAndShadowOffset();
        layoutChild.doMisplayAnimation = false;
      } else {
        // Animate the card going:
        // - from the deck to a player's hand (or vice versa)
        // - or leaving the hand to the discard pile (or vice versa)

        // Also, animate the rest of the cards sliding over.
        layoutChild.card.startedTweening();
        layoutChild.card.setRaiseAndShadowOffset();
        const animateToLayout = () => {
          animate(
            layoutChild,
            {
              duration: CARD_ANIMATION_LENGTH,
              x: newX,
              y: 0,
              scale,
              rotation: 0,
              opacity: 1,
              // eslint-disable-next-line @typescript-eslint/unbound-method
              easing: Konva.Easings.EaseOut,
              onFinish: () => {
                layoutChild.card.finishedTweening();
                layoutChild.checkSetDraggable();
              },
            },
            !globals.options.speedrun,
          );
        };

        if (layoutChild.doMisplayAnimation) {
          // If this card just misplayed, do a special animation.
          layoutChild.doMisplayAnimation = false;

          const suit =
            globals.variant.suits[layoutChild.card.state.suitIndex!]!;
          const playStack = globals.elements.playStacks.get(suit)!;
          const pos = this.getAbsolutePosition();
          const playStackPos = playStack.getAbsolutePosition();

          animate(
            layoutChild,
            {
              duration: CARD_ANIMATION_LENGTH,
              x: playStackPos.x - pos.x,
              y: playStackPos.y - pos.y,
              scale: (playStack.height() * scale) / handHeight,
              rotation: 0,
              opacity: 1,
              // eslint-disable-next-line @typescript-eslint/unbound-method
              easing: Konva.Easings.EaseOut,
              onFinish: () => {
                layoutChild.rotation(360);
                animateToLayout();
              },
            },
            !globals.options.speedrun,
          );
        } else {
          animateToLayout();
        }
      }

      x +=
        (scale * layoutChild.width() + spacingBetweenCards) *
        (this.reverse ? -1 : 1);
    }
  }

  checkSetDraggableAll(): void {
    this.children.each((layoutChild) => {
      (layoutChild as unknown as LayoutChild).checkSetDraggable();
    });
  }

  getAbsoluteCenterPos(): { x: number; y: number } {
    const pos = this.getAbsolutePosition(); // The top-left-hand corner

    const w = this.width();
    const h = this.height();

    // The rotation comes from Konva in clockwise degrees but we need to convert it to
    // counter-clockwise radians.
    const rot = (-this.origRotation / 180) * Math.PI;

    pos.x += (w / 2) * Math.cos(rot);
    pos.y -= (w / 2) * Math.sin(rot);
    pos.x += (h / 2) * Math.sin(rot); // sin(x) = cos(x - (PI / 2))
    pos.y -= (h / 2) * -Math.cos(rot); // -cos(x) = sin(x - (PI / 2))

    return pos;
  }

  setEmpathy(enabled: boolean): void {
    if (enabled === this.empathy) {
      // No change
      return;
    }

    this.empathy = enabled;
    this.children.each((layoutChild) => {
      const card = layoutChild.children[0] as HanabiCard;

      // As a sanity check, make sure that the card exists. (It can be undefined sometimes when
      // rewinding.)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (card === undefined) {
        return;
      }

      card.setEmpathy(enabled);
    });
  }
}
