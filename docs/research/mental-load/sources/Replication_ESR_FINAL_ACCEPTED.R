######################
######################
#### Replication data for: 
#### The Political Consequences of the Mental Load 
#### Ana Catalano Weeks
#### European Sociological Review, 2025 
######################
######################

rm(list = ls())

#########################
library("stargazer")
library("dplyr")
library("ggplot2")
library(rstatix)
library(ggpubr)
library(sjPlot)
library(interactions)
library(margins)
library(prediction)
library(stargazer)
library(xtable)
library(marginaleffects)

options(scipen = 999)
########################

## Load data 

load("Replication_Data_ESR.RData")
head(dat1)

women<-subset(dat1, woman==1)
nrow(women)
men<-subset(dat1, woman==0)
nrow(men)

### Cronbach's alpha of the scale 

vars<-c("Q34_1", "Q34_2", "Q34_3", 
"Q36_1", "Q36_2", "Q36_3",
"Q37_1", "Q37_2", "Q37_3",
"Q38_1", "Q38_2", "Q38_3",
"Q39_1", "Q39_2", "Q39_3",
"Q40_1.1", "Q40_2", "Q40_3",
"Q41_1", "Q41_2", "Q41_3")

checking<-dat1[,vars]
library(ltm)
cronbach.alpha(checking) 

mean(dat1$p_m_load_relevant_2, na.rm=TRUE) ##20.3
mean(dat1$NA_2_tally, na.rm=TRUE) ##0.7

####################
## Satisfied with mental load?

mean(dat1$ml_satisfied[dat1$woman==0], na.rm=TRUE)
mean(dat1$ml_satisfied[dat1$woman==1], na.rm=TRUE)

mean(dat1$ml_satisfied[dat1$woman==1 & dat1$employed==1], na.rm=TRUE)
mean(dat1$ml_satisfied[dat1$woman==1 & dat1$employed==0], na.rm=TRUE)

#####################
#####################
### Figure 1 
#####################
#####################

##mean by group 
dat2<-dat1
dat2$Gender<-NA
dat2$Gender[dat2$woman==1]<-"Women"
dat2$Gender[dat2$woman==0]<-"Men"
table(dat2$Gender)

library(plyr)
mu <- ddply(dat2, "Gender", summarise, grp.mean=mean(p_m_load_share_relevant2, na.rm=TRUE))
head(mu)

p <- ggplot(dat2, aes(x = p_m_load_share_relevant2, colour = Gender, fill = Gender)) + 
  geom_density(alpha = 0.2) +
  geom_vline(data = mu, aes(xintercept = grp.mean, color = Gender), linetype = "dashed") + 
  theme_classic() +
  labs(title = "", x = "Share of cognitive household labor done by 'mostly me'", y = "Density") +
  scale_color_manual(values = c("gray", "black"), labels = c("Men", "Women")) +
  scale_fill_manual(values = c("gray", "black"), guide = FALSE)

# Show the plot
print(p)
ggsave("Fig1.eps", plot = p, width = 6, height = 6, device = cairo_ps)

median(dat1$p_m_load_share_relevant2[dat1$woman==0], na.rm=TRUE)
median(dat1$p_m_load_share_relevant2[dat1$woman==1], na.rm=TRUE)

### what share of women are 95% or more? 
proportion_above_095 <- mean(women$p_m_load_share_relevant2 > 0.949, na.rm=TRUE)
cat("Proportion above 0.95:", proportion_above_095, "\n")
## 28%

### above 88 ?
proportion_above_095 <- mean(women$p_m_load_share_relevant2 > 0.879, na.rm=TRUE)
cat("Proportion above 0.95:", proportion_above_095, "\n") 
## 35%

### above 76 ?
proportion_above_095 <- mean(women$p_m_load_share_relevant2 > 0.759, na.rm=TRUE)
cat("Proportion above 0.95:", proportion_above_095, "\n") 
## 52

### Below 50%? 
proportion_above_095 <- mean(women$p_m_load_share_relevant2 < .5, na.rm=TRUE)
cat("Proportion above 0.95:", proportion_above_095, "\n") 
## less than 20%

### below 54
proportion_above_095 <- mean(women$p_m_load_share_relevant2 < .54, na.rm=TRUE)
cat("Proportion above 0.95:", proportion_above_095, "\n") 
## less than 20%

### share of men over 70%
proportion_above_095 <- mean(men$p_m_load_share_relevant2 > 0.7, na.rm=TRUE)
cat("Proportion above 0.95:", proportion_above_095, "\n") 

#####################
#####################
### Figure 2
#####################
#####################

## OLS regressions of political engagement on gender 

mod1<-lm(slocal~woman, data=dat1)
summary(mod1)
mod2<-lm(snational~woman, data=dat1)
summary(mod2)
mod3<-lm(sinternational~woman, data=dat1)
summary(mod3)
mod4<-lm(sinterest_prices~woman, data=dat1)
summary(mod4)
mod6<-lm(sinterest_abortion~woman, data=dat1)
summary(mod6)
mod7<-lm(sinterest_guns~woman, data=dat1)
summary(mod7)

results <- list(mod1, mod2, mod3, mod4, mod6, mod7)

fx <- sapply(results, function(x){unlist(summary(x)$coefficients["woman", 1])})
l95 <- sapply(results, function(x){unlist(confint(x, level=0.95)["woman", 1])})
u95 <- sapply(results, function(x){unlist(confint(x, level=0.95)["woman", 2])})
ys <- c(6,5,4,3,2,1)

postscript("Fig2.eps", height=6, width=12, paper="special", horizontal=FALSE, onefile=FALSE)
par(mar=c(5.1,24,2.1,2.1))

plot(fx, ys, xlim=c(-.25,.1), ylab='', yaxt='n', type='n', xaxt='n', main="", xlab="")
abline(v=0)
for (i in 1:6){
  segments(l95[i], ys[i], u95[i], ys[i], col='black', lwd=1)
  points(fx[i], ys[i], pch=16, col='black', cex=1)
}

axis(1, xlab="Gender and Political Engagement among Parents", cex.axis=1.5)
axis(2, at=c(6,5,4,3,2,1), 
     labels=c('Interest: local issues', 'Interest: national issues', 'Interest: international issues', 
              'Interest: prices / inflation', 'Interest: abortion', 'Interest: guns'), 
     las=2, cex.axis=1.5)
title(xlab="", cex.lab=1)

dev.off()

### Table for Appendix 

### Table A2 

stargazer(mod1, mod2, mod3, mod4, mod6, mod7,
          digits=2, dep.var.labels.include = T, no.space=T,
          omit.stat = c("f", "rsq", "ser"))

#####################
#####################
### Figure 3 / Appendix Tables A4 -- A7
#####################
#####################

### Among women

### dispersion? 
quantile(dat1$p_m_load_share_relevant2[dat1$woman==1], na.rm=TRUE)
#  0%       25%       50%       75%      100% 
# 0.0000000 0.5691964 0.7619048 0.9523810 1.0000000 

# calculate deciles
res<-quantile(dat1$p_m_load_share_relevant2[dat1$woman==1], na.rm=TRUE, probs=seq(0.1,1, by=0.1))
# display 
res
### For mothers, 80th percentile is 1


## and check for fathers 
quantile(dat1$p_m_load_share_relevant2[dat1$woman==0], na.rm=TRUE)
##    0%       25%       50%       75%      100% 
## 0.0000000 0.2000000 0.3809524 0.6666667 1.0000000 
# calculate deciles
res<-quantile(dat1$p_m_load_share_relevant2[dat1$woman==0], na.rm=TRUE, probs=seq(0.1,1, by=0.1))
# display 
res
### For fathers, 80th percentile is .0761

######################
### Model 1
######################

md1a<-lm(slocal ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
 , data=subset(dat1, woman==1))
summary(md1a)

md1b<-lm(slocal ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate  +  I(pl_estimate^2) +
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1))
summary(md1b) 

### average marginal effects at specified values of mental load 

avg_slopes(md1b, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md1b, newdata = datagrid(p_m_load_share_relevant2 =  0.56))
avg_slopes(md1b, newdata = datagrid(p_m_load_share_relevant2 =  0.761)) ### NEG
avg_slopes(md1b, newdata = datagrid(p_m_load_share_relevant2 =  0.952))
avg_slopes(md1b, newdata = datagrid(p_m_load_share_relevant2 =  1))

jpeg("Fig3a.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI

# Adjust text sizes for the plot
cplot(md1b, "p_m_load_share_relevant2", what = "prediction", 
      main = "Local Politics", 
      xlab = "% Mental Load", ylim = c(.4, .7), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks

# Get box plot values -- for use in all figures
box_vals <- quantile(dat1$p_m_load_share_relevant2[dat1$woman==1], 
                     c(0.05, 0.25, 0.5, 0.75, 0.95), na.rm=TRUE)
lines(c(box_vals[1], box_vals[5]), c(.42, .42), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.42, .42), col = "darkgrey", lwd = 6)
points(box_vals[3], .42, col = "black", pch = 15, lwd=8)

dev.off()


## what about the role of physical hh labor?
avg_slopes(md1b, newdata = datagrid(pl_estimate =  0))
avg_slopes(md1b, newdata = datagrid(pl_estimate =  0.6))
avg_slopes(md1b, newdata = datagrid(pl_estimate =  0.8))
avg_slopes(md1b, newdata = datagrid(pl_estimate =  0.94))
avg_slopes(md1b, newdata = datagrid(pl_estimate =  1))

### does not reduce interest in local issues even at v high levels -- effect is positive 

######################
### Model 2 
######################

md2a<-lm(snational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
 , data=subset(dat1, woman==1))
summary(md2a)
  
md2b<-lm(snational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1))
summary(md2b) 

avg_slopes(md2b, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md2b, newdata = datagrid(p_m_load_share_relevant2 =  0.56))
avg_slopes(md2b, newdata = datagrid(p_m_load_share_relevant2 =  0.761)) ##NEG
avg_slopes(md2b, newdata = datagrid(p_m_load_share_relevant2 =  0.952))
avg_slopes(md2b, newdata = datagrid(p_m_load_share_relevant2 =  1))

### sig effects emerge at 95% of mental load.  

### Positive before 54 percent of mental load 
avg_slopes(md2b, newdata = datagrid(p_m_load_share_relevant2 =  0.54))

## predictions at different levels: mean .71 and 1 SD above .98
predictions(md2b, newdata = datagrid(p_m_load_share_relevant2= c(0.71, 0.98)))

sd(women$p_m_load_share_relevant2, na.rm=TRUE)

jpeg("Fig3b.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI

# Adjust text sizes for the plot
cplot(md2b, "p_m_load_share_relevant2", what = "prediction", 
      main = "National Politics", 
      xlab = "% Mental Load", ylim = c(.4, .7), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks

# Get box plot values -- for use in all figures
box_vals <- quantile(dat1$p_m_load_share_relevant2[dat1$woman==1], 
                     c(0.05, 0.25, 0.5, 0.75, 0.95), na.rm=TRUE)
lines(c(box_vals[1], box_vals[5]), c(.42, .42), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.42, .42), col = "darkgrey", lwd = 6)
points(box_vals[3], .42, col = "black", pch = 15, lwd=8)

dev.off()

## what about the role of physical hh labor?
avg_slopes(md2b, newdata = datagrid(pl_estimate =  0))
avg_slopes(md2b, newdata = datagrid(pl_estimate =  0.6))
avg_slopes(md2b, newdata = datagrid(pl_estimate =  0.8))
avg_slopes(md2b, newdata = datagrid(pl_estimate =  0.94))
avg_slopes(md2b, newdata = datagrid(pl_estimate =  1))

### does not reduce interest in national issues even at v high levels 

######################
### Model 3
######################

md3a<-lm(sinternational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
 , data=subset(dat1, woman==1))
summary(md3a)
  
md3b<-lm(sinternational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1))
summary(md3b) 

avg_slopes(md3b, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md3b, newdata = datagrid(p_m_load_share_relevant2 =  0.56))
avg_slopes(md3b, newdata = datagrid(p_m_load_share_relevant2 =  0.761)) ###NEG
avg_slopes(md3b, newdata = datagrid(p_m_load_share_relevant2 =  0.952))
avg_slopes(md3b, newdata = datagrid(p_m_load_share_relevant2 =  1))

### marginal effects are not sign 

jpeg("Fig3c.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI
# Adjust text sizes for the plot
cplot(md3b, "p_m_load_share_relevant2", what = "prediction", 
      main = "International Politics", 
      xlab = "% Mental Load", ylim = c(.4, .7), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks

# Get box plot values -- for use in all figures
box_vals <- quantile(dat1$p_m_load_share_relevant2[dat1$woman==1], 
                     c(0.05, 0.25, 0.5, 0.75, 0.95), na.rm=TRUE)
lines(c(box_vals[1], box_vals[5]), c(.42, .42), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.42, .42), col = "darkgrey", lwd = 6)
points(box_vals[3], .42, col = "black", pch = 15, lwd=8)

dev.off()

## what about the role of physical hh labor?
avg_slopes(md3b, newdata = datagrid(pl_estimate =  0))
avg_slopes(md3b, newdata = datagrid(pl_estimate =  0.6))
avg_slopes(md3b, newdata = datagrid(pl_estimate =  0.8))
avg_slopes(md3b, newdata = datagrid(pl_estimate =  0.94))
avg_slopes(md3b, newdata = datagrid(pl_estimate =  1))

### does not reduce interest in national issues even at v high levels 

######################
## Model 4
######################

md4a<-lm(sinterest_prices ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
 , data=subset(dat1, woman==1))
summary(md4a)
  
md4b<-lm(sinterest_prices ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1))
summary(md4b) 

avg_slopes(md4b, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md4b, newdata = datagrid(p_m_load_share_relevant2 =  0.56))
avg_slopes(md4b, newdata = datagrid(p_m_load_share_relevant2 =  0.761)) ##NEG
avg_slopes(md4b, newdata = datagrid(p_m_load_share_relevant2 =  0.952))
avg_slopes(md4b, newdata = datagrid(p_m_load_share_relevant2 =  1))

## negative effect above 88%
avg_slopes(md4b, newdata = datagrid(p_m_load_share_relevant2 =  0.88))

### and positive effect below 61%
avg_slopes(md4b, newdata = datagrid(p_m_load_share_relevant2 =  0.61))

## predictions at different levels: mean .71 and 1 SD above .98
predictions(md4b, newdata = datagrid(p_m_load_share_relevant2= c(0.71, 0.98)))

jpeg("Fig3d.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI
# Adjust text sizes for the plot
cplot(md4b, "p_m_load_share_relevant2", what = "prediction", 
      main = "Inflation / Prices", 
      xlab = "% Mental Load", ylim = c(.5, .8), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks
lines(c(box_vals[1], box_vals[5]), c(.52, .52), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.52, .52), col = "darkgrey", lwd = 6)
points(box_vals[3], .52, col = "black", pch = 15, lwd=8)
dev.off()

## what about the role of physical hh labor?
avg_slopes(md4b, newdata = datagrid(pl_estimate =  0))
avg_slopes(md4b, newdata = datagrid(pl_estimate =  0.6))
avg_slopes(md4b, newdata = datagrid(pl_estimate =  0.8))
avg_slopes(md4b, newdata = datagrid(pl_estimate =  0.94))
avg_slopes(md4b, newdata = datagrid(pl_estimate =  1))


#####################
## Model 5
#####################

md5a<-lm(sinterest_abortion ~ p_m_load_share_relevant2  , data=subset(dat1, woman==1))
summary(md10a)
  
md5b<-lm(sinterest_abortion ~ p_m_load_share_relevant2  + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1))
summary(md5b) 

avg_slopes(md5b, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md5b, newdata = datagrid(p_m_load_share_relevant2 =  0.56))
avg_slopes(md5b, newdata = datagrid(p_m_load_share_relevant2 =  0.761)) ###POS
avg_slopes(md5b, newdata = datagrid(p_m_load_share_relevant2 =  0.952))
avg_slopes(md5b, newdata = datagrid(p_m_load_share_relevant2 =  1))

jpeg("Fig3e.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI
# Adjust text sizes for the plot
cplot(md5b, "p_m_load_share_relevant2", what = "prediction", 
      main = "Abortion", 
      xlab = "% Mental Load", ylim = c(.5, .8), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks
lines(c(box_vals[1], box_vals[5]), c(.52, .52), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.52, .52), col = "darkgrey", lwd = 6)
points(box_vals[3], .52, col = "black", pch = 15, lwd=8)
dev.off()


#################
## Model 6
##################

md6a<-lm(sinterest_guns ~ p_m_load_share_relevant2
 , data=subset(dat1, woman==1))
summary(md6a)
  
md6b<-lm(sinterest_guns ~ p_m_load_share_relevant2 + pl_estimate + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1))
summary(md6b) 

jpeg("Fig3f.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI
# Adjust text sizes for the plot
cplot(md6b, "p_m_load_share_relevant2", what = "prediction", 
      main = "Gun Control", 
      xlab = "% Mental Load", ylim = c(.5, .8), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks
lines(c(box_vals[1], box_vals[5]), c(.52, .52), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.52, .52), col = "darkgrey", lwd = 6)
points(box_vals[3], .52, col = "black", pch = 15, lwd=8)
dev.off()

## predicted values at median compared to 1 SD above 

mean(women$p_m_load_share_relevant2, na.rm=TRUE) ##71 
sd(women$p_m_load_share_relevant2, na.rm=TRUE) ##71 
predictions(md6b, newdata = datagrid(p_m_load_share_relevant2= c(.71,.97))) 

### mental load increases interest in gun control 

######################
######################
## Tables for main analysis (Appendix Tables C2 and C4)
######################
######################

library(stargazer)
stargazer(md1b,md2b,md3b,md4b,md5b,md6b, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))

## and bivariate

stargazer(md1a,md2a,md3a,md4a, md5a,md6a, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))


################################
#### For Table 2 in text 
################################

### Mothers (see estimate and SE for p_m_load_share_relevant2)

###median 
avg_slopes(md1b, newdata = datagrid(p_m_load_share_relevant2 =  0.761)) 
avg_slopes(md2b, newdata = datagrid(p_m_load_share_relevant2 =  0.761)) 
avg_slopes(md3b, newdata = datagrid(p_m_load_share_relevant2 =  0.761)) 
avg_slopes(md4b, newdata = datagrid(p_m_load_share_relevant2 =  0.761))
avg_slopes(md5b, newdata = datagrid(p_m_load_share_relevant2 =  0.761)) 
avg_slopes(md6b, newdata = datagrid(p_m_load_share_relevant2 =  0.761)) 

###high  -- 80th percentile
avg_slopes(md1b, newdata = datagrid(p_m_load_share_relevant2 =  1))
avg_slopes(md2b, newdata = datagrid(p_m_load_share_relevant2 =  1))
avg_slopes(md3b, newdata = datagrid(p_m_load_share_relevant2 =  1))
avg_slopes(md4b, newdata = datagrid(p_m_load_share_relevant2 =  1))
avg_slopes(md5b, newdata = datagrid(p_m_load_share_relevant2 =  1))
avg_slopes(md6b, newdata = datagrid(p_m_load_share_relevant2 =  1))

######################
######################
### Among men 
######################
######################

fivenum(men$p_m_load_share_relevant2)

## 0.0000000 0.2000000 0.3809524 0.6666667 1.0000000
### note that woman = 0 is men // other genders taken out 

####################
### Model 1
####################

md1a2<-lm(slocal ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
 , data=subset(dat1, woman==0))
summary(md1a2)
  
md1b2<-lm(slocal ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +   
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==0))
summary(md1b2) 

avg_slopes(md1b2, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md1b2, newdata = datagrid(p_m_load_share_relevant2 =  0.2))
avg_slopes(md1b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38)) ##POS 
avg_slopes(md1b2, newdata = datagrid(p_m_load_share_relevant2 =  0.67))
avg_slopes(md1b2, newdata = datagrid(p_m_load_share_relevant2 =  1))

### sig and pos effect up until 65
avg_slopes(md1b2, newdata = datagrid(p_m_load_share_relevant2 =  0.65))

## no sig neg impact 

jpeg("Fig4a.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI
# Adjust text sizes for the plot
cplot(md1b2, "p_m_load_share_relevant2", what = "prediction", 
      main = "Local Politics", 
      xlab = "% Mental Load", ylim = c(.6, 1), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks
# Get box plot values -- for use in all figures
box_vals <- quantile(dat1$p_m_load_share_relevant2[dat1$woman==0], c(0.05, 0.25, 0.5, 0.75, 0.95), na.rm=TRUE)
lines(c(box_vals[1], box_vals[5]), c(.62, .62), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.62, .62), col = "darkgrey", lwd = 6)
points(box_vals[3], .62, col = "black", pch = 15, lwd=8)

dev.off()


####################
### Model 2 
####################

md2a2<-lm(snational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
 , data=subset(dat1, woman==0))
summary(md2a2)
  
md2b2<-lm(snational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +   highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==0))
summary(md2b2) 

avg_slopes(md2b2, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md2b2, newdata = datagrid(p_m_load_share_relevant2 =  0.2))
avg_slopes(md2b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38))
avg_slopes(md2b2, newdata = datagrid(p_m_load_share_relevant2 =  0.67))
avg_slopes(md2b2, newdata = datagrid(p_m_load_share_relevant2 =  1))

### sig pos impact up until 
avg_slopes(md2b2, newdata = datagrid(p_m_load_share_relevant2 =  0.64))
### no sig negative effect of the mental load 

jpeg("Fig4b.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI
# Adjust text sizes for the plot
cplot(md2b2, "p_m_load_share_relevant2", what = "prediction", 
      main = "National Politics", 
      xlab = "% Mental Load", ylim = c(.6, 1), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks
# Get box plot values -- for use in all figures
box_vals <- quantile(dat1$p_m_load_share_relevant2[dat1$woman==0], c(0.05, 0.25, 0.5, 0.75, 0.95), na.rm=TRUE)
lines(c(box_vals[1], box_vals[5]), c(.62, .62), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.62, .62), col = "darkgrey", lwd = 6)
points(box_vals[3], .62, col = "black", pch = 15, lwd=8)
dev.off()


####################
### Model 3
####################

md3a2<-lm(sinternational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
 , data=subset(dat1, woman==0))
summary(md3a2)
  
md3b2<-lm(sinternational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate  + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==0))
summary(md3b2) 

avg_slopes(md3b2, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md3b2, newdata = datagrid(p_m_load_share_relevant2 =  0.2))
avg_slopes(md3b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38))
avg_slopes(md3b2, newdata = datagrid(p_m_load_share_relevant2 =  0.67))
avg_slopes(md3b2, newdata = datagrid(p_m_load_share_relevant2 =  1))

## sign at pos effect until 74 percent 

avg_slopes(md3b2, newdata = datagrid(p_m_load_share_relevant2 =  0.73))

## and no negative effect at high levels 

cplot(md3b2, "p_m_load_share_relevant2", what = "prediction", main = "Predicted Interest in International Politics, 
Given Share Mental Load", xlab = "% Mental Load", ylim = c(.6,1))
lines(c(box_vals[1], box_vals[5]), c(.62, .62), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.62, .62), col = "darkgrey", lwd = 6)
points(box_vals[3], .62, col = "black", pch = 15, lwd=8)

jpeg("Fig4c.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI
# Adjust text sizes for the plot
cplot(md3b2, "p_m_load_share_relevant2", what = "prediction", 
      main = "International Politics", 
      xlab = "% Mental Load", ylim = c(.6, 1), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks
# Get box plot values -- for use in all figures
box_vals <- quantile(dat1$p_m_load_share_relevant2[dat1$woman==0], c(0.05, 0.25, 0.5, 0.75, 0.95), na.rm=TRUE)
lines(c(box_vals[1], box_vals[5]), c(.62, .62), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.62, .62), col = "darkgrey", lwd = 6)
points(box_vals[3], .62, col = "black", pch = 15, lwd=8)
dev.off()


####################
### Model 4
####################

md4a2<-lm(sinterest_prices ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
 , data=subset(dat1, woman==0))
summary(md4a2)
  
md4b2<-lm(sinterest_prices ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate  + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==0))
summary(md4b2) 

avg_slopes(md4b2, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md4b2, newdata = datagrid(p_m_load_share_relevant2 =  0.2))
avg_slopes(md4b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38))
avg_slopes(md4b2, newdata = datagrid(p_m_load_share_relevant2 =  0.67))
avg_slopes(md4b2, newdata = datagrid(p_m_load_share_relevant2 =  1))

## pos at low levels -- until 47\% 
avg_slopes(md4b2, newdata = datagrid(p_m_load_share_relevant2 =  0.47))

### very high levels decrease interest in prices / inflation also for men. negative effect around 73% of mental load 
avg_slopes(md4b2, newdata = datagrid(p_m_load_share_relevant2 =  0.73))

jpeg("Fig4d.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI
# Adjust text sizes for the plot
cplot(md4b2, "p_m_load_share_relevant2", what = "prediction", 
      main = "Inflation / Prices", 
      xlab = "% Mental Load", ylim = c(.5, .9), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks
# Get box plot values -- for use in all figures
box_vals <- quantile(dat1$p_m_load_share_relevant2[dat1$woman==0], c(0.05, 0.25, 0.5, 0.75, 0.95), na.rm=TRUE)
lines(c(box_vals[1], box_vals[5]), c(.52, .52), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.52, .52), col = "darkgrey", lwd = 6)
points(box_vals[3], .52, col = "black", pch = 15, lwd=8)
dev.off()


####################
### Model 5
####################

md5a2<-lm(sinterest_abortion ~ p_m_load_share_relevant2  
 , data=subset(dat1, woman==0))
summary(md5a2)
  
md5b2<-lm(sinterest_abortion ~ p_m_load_share_relevant2  + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==0))
summary(md5b2) 

avg_slopes(md5b2, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md5b2, newdata = datagrid(p_m_load_share_relevant2 =  0.2))
avg_slopes(md5b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38))
avg_slopes(md5b2, newdata = datagrid(p_m_load_share_relevant2 =  0.67))
avg_slopes(md5b2, newdata = datagrid(p_m_load_share_relevant2 =  1))

jpeg("Fig4e.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI
# Adjust text sizes for the plot
cplot(md5b2, "p_m_load_share_relevant2", what = "prediction", 
      main = "Abortion", 
      xlab = "% Mental Load", ylim = c(.5, .9), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks
# Get box plot values -- for use in all figures
box_vals <- quantile(dat1$p_m_load_share_relevant2[dat1$woman==0], c(0.05, 0.25, 0.5, 0.75, 0.95), na.rm=TRUE)
lines(c(box_vals[1], box_vals[5]), c(.52, .52), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.52, .52), col = "darkgrey", lwd = 6)
points(box_vals[3], .52, col = "black", pch = 15, lwd=8)
dev.off()

####################
### Model 6
####################

md6a2<-lm(sinterest_guns ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
 , data=subset(dat1, woman==0))
summary(md6a2)
  
md6b2<-lm(sinterest_guns ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +   
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==0))
summary(md6b2) 

avg_slopes(md6b2, newdata = datagrid(p_m_load_share_relevant2 =  0))
avg_slopes(md6b2, newdata = datagrid(p_m_load_share_relevant2 =  0.2))
avg_slopes(md6b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38))
avg_slopes(md6b2, newdata = datagrid(p_m_load_share_relevant2 =  0.67))
avg_slopes(md6b2, newdata = datagrid(p_m_load_share_relevant2 =  1))

jpeg("Fig4f.jpg", width=3, height=4, units="in", res=300)  # Save with 300 DPI
# Adjust text sizes for the plot
cplot(md6b2, "p_m_load_share_relevant2", what = "prediction", 
      main = "Gun Control", 
      xlab = "% Mental Load", ylim = c(.5, .9), 
      cex.main = 0.7,  # Smaller font size for the main title
      cex.lab = 0.7,   # Smaller font size for axis labels
      cex.axis = 0.7)  # Smaller font size for axis ticks
# Get box plot values -- for use in all figures
box_vals <- quantile(dat1$p_m_load_share_relevant2[dat1$woman==0], c(0.05, 0.25, 0.5, 0.75, 0.95), na.rm=TRUE)
lines(c(box_vals[1], box_vals[5]), c(.52, .52), col = "darkgrey", lty=3, lwd = 3)
lines(c(box_vals[2], box_vals[4]), c(.52, .52), col = "darkgrey", lwd = 6)
points(box_vals[3], .52, col = "black", pch = 15, lwd=8)
dev.off()

##############################
##############################
## Tables for main analysis / Appendix Tables C3 and C5 
##############################
##############################

library(stargazer)

stargazer(md1b2,md2b2,md3b2,md4b2,md6b2, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))

stargazer(md5b2, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))



## and bivariate  

stargazer(md1a2,md2a2,md3a2,md4a2,md6a2, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))

stargazer(md5a2, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))

#################################
## Table 2 in text ##############
#################################

### Fathers (see estimate and SE for p_m_load_share_relevant2)

###median 
avg_slopes(md1b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38)) 
avg_slopes(md2b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38)) 
avg_slopes(md3b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38)) 
avg_slopes(md4b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38))
avg_slopes(md5b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38)) 
avg_slopes(md6b2, newdata = datagrid(p_m_load_share_relevant2 =  0.38)) 

###high 
avg_slopes(md1b2, newdata = datagrid(p_m_load_share_relevant2 =  .76))
avg_slopes(md2b2, newdata = datagrid(p_m_load_share_relevant2 =  .76))
avg_slopes(md3b2, newdata = datagrid(p_m_load_share_relevant2 =  .76))
avg_slopes(md4b2, newdata = datagrid(p_m_load_share_relevant2 =  .76))
avg_slopes(md5b2, newdata = datagrid(p_m_load_share_relevant2 =  .76))
avg_slopes(md6b2, newdata = datagrid(p_m_load_share_relevant2 =  .76))

#####################
##################### 
## Appendix Table A1 
#####################
#####################

## Comparison with census data -- get the means here 

vars<-c("woman", "man", "age18_24", "age25_34", "age35_44", "age45_54", "age55plus",
 "white", "black", "asian", "mixed_other_race", "edu_lessHS", "edu_HS", "edu_somecollege", "edu_BAplus")
sumdat<-dat1[,vars]
stargazer(sumdat)

#####################
#####################
## Appendix A2 
#####################
#####################

## Summary stats -- 

vars<-c("woman", "age18_24", "age25_34", "age35_44", "age45_54", "age55plus",
 "white", "black", "asian", "mixed_other_race", "highered", "p_m_load_share_relevant2",
"pl_estimate", "partner", "Democrat", "Republican", "income_none", "income_low", "income_med", "income_high",
 "kidage_0_1", "kidage_2_3", "kidage_4_5", "kidage_over5", 
"num_children", "slocal", "snational", "sinternational", "sinterest_prices", "sinterest_economy",
 "sinterest_abortion", "sinterest_guns" )
sumdat<-dat1[,vars]
stargazer(sumdat)


#####################
#####################
### Appendix Fig A1
#####################
#####################

vars<-c("p_m_load_share_relevant2", "ml_estimate", "woman", "hrs_plwork2")
dat2<-na.omit(dat1[,vars])
dat2$Gender<-NA
dat2$Gender[dat2$woman==1]<-"Mothers"
dat2$Gender[dat2$woman==0]<-"Fathers"

# Calculate correlation coefficient
cor_test <- cor.test(dat2$p_m_load_share_relevant2, dat2$ml_estimate)
cor_coeff <- cor_test$estimate
p_value <- cor_test$p.value
### correlation coefficient = 0.6


# Create the ggplot 
p <- ggplot(dat2, aes(x = p_m_load_share_relevant2, y = ml_estimate)) +
  geom_point() +
  geom_smooth(method = "lm", se = FALSE, colour="black") +
  labs(
    title = "",
    x = "Item-Based Measure of Mental Load",
    y = "Self-Estimated Share of Mental Load",
    caption = paste("Correlation Coefficient:", round(cor_coeff, 2), "p-value:", format.pval(p_value))
  ) +
  theme_classic()+theme(axis.text=element_text(size=15), axis.title=element_text(size=15)) 
p
# Print the plot
p + 
 theme(plot.caption = element_text(size = 15) )

# Create the ggplot with separate lines for each gender
p <- ggplot(dat2, aes(x = p_m_load_share_relevant2, y = ml_estimate)) +
  geom_point(aes(color = Gender), alpha = 0.5) +
  geom_smooth(aes(color = Gender, linetype = Gender), method = "lm", se = FALSE) +
  scale_color_manual(values = c("gray60", "black"), labels = c("Fathers", "Mothers")) +
  labs(
    title = "",
    x = "Item-Based Measure of Mental Load",
    y = "Self-Estimated Share of Mental Load",
    caption = paste("Correlation Coefficient:", round(cor_coeff, 2), "p-value:", format.pval(p_value))
  ) +
  theme_classic()

# Print the plot
print(p)

### what is the correlation among mothers vs fathers 
cor_test2 <- cor.test(dat2$p_m_load_share_relevant2[dat2$Gender=="Mothers"], dat2$ml_estimate[dat2$Gender=="Mothers"])
cor_test3 <- cor.test(dat2$p_m_load_share_relevant2[dat2$Gender=="Fathers"], dat2$ml_estimate[dat2$Gender=="Fathers"])
cor_test2 ## 0.53
cor_test3 ## 0.52

mean(dat1$ml_estimate[dat1$woman==0], na.rm=TRUE)
mean(dat1$ml_estimate[dat1$woman==1], na.rm=TRUE)

### comparison with mean physical hh labor

mean(dat1$pl_estimate[dat1$woman==0], na.rm=TRUE)
mean(dat1$pl_estimate[dat1$woman==1], na.rm=TRUE)

mean(dat1$hrs_care[dat1$woman==0], na.rm=TRUE)
mean(dat1$hrs_care[dat1$woman==1], na.rm=TRUE)

mean(dat1$hrs_plwork[dat1$woman==0], na.rm=TRUE)
mean(dat1$hrs_plwork[dat1$woman==1], na.rm=TRUE)

71/168 - 42/168

mean(dat1$hrs_house[dat1$woman==0], na.rm=TRUE)
mean(dat1$hrs_house[dat1$woman==1], na.rm=TRUE)

## t-tests 
t.test(dat1$p_m_load_share_relevant2~as.factor(dat1$woman))
t.test(dat1$pl_estimate~as.factor(dat1$woman))
t.test(dat1$hrs_plwork~as.factor(dat1$woman))

#####################
######################
######################
## Appendix Table B1
## Regressions: DV mental load 
######################
######################

modaa<- lm(p_m_load_share_relevant2 ~ highered + empinc + relative_income +
black + asian + mixed_other_race + age_range + 
partner + age_youngest + num_children + Democrat + lgbt, data = subset(dat1, woman==1)) 
summary(modaa) 

modaa2<- lm(p_m_load_share_relevant2 ~ highered + empinc + relative_income +
black + asian + mixed_other_race + age_range + 
partner + age_youngest + num_children + Democrat + lgbt, data = subset(dat1, woman==0)) 
summary(modaa2) 

library(stargazer)
stargazer(modaa,modaa2, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))


######################
######################
## AIC tests #########
######################
######################

## When comparing models fitted by maximum likelihood to the same data, the smaller the AIC or BIC, the better the fit.
## AIC tests below for both cognitive and physical HH labor, for mothers and fathers separately

### Local Issues 

aic1a<-lm(slocal ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==1))
summary(aic1a)
aic1a2<-lm(slocal ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==1))
summary(aic1a2)

AIC(aic1a, aic1a2) ## AIC is smaller including quadratic 

aic1b<-lm(slocal ~  pl_estimate  
  , data=subset(dat1, woman==1))
summary(aic1b)
aic1b2<-lm(slocal ~  pl_estimate +  I(pl_estimate^2) 
  , data=subset(dat1, woman==1))
summary(aic1b2)
AIC(aic1b, aic1b2)
 ## AIC is smaller including quadratic 

### and for men 

aic1c<-lm(slocal ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==0))
summary(aic1c)
aic1c2<-lm(slocal ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==0))
summary(aic1c2)
AIC(aic1c, aic1c2) ## AIC is smaller including quadratic 

aic1d<-lm(slocal ~ pl_estimate  
  , data=subset(dat1, woman==0))
summary(aic1d)
aic1d2<-lm(slocal ~ pl_estimate +  I(pl_estimate^2) 
  , data=subset(dat1, woman==0))
summary(aic1d2)
AIC(aic1d, aic1d2) ## AIC is smaller not including quadratic 

### National Issues

aic2a<-lm(snational ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==1))
summary(aic2a)
aic2a2<-lm(snational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==1))
summary(aic2a2)

AIC(aic2a, aic2a2) ## = smaller for quadratic model

aic2b<-lm(snational ~ pl_estimate 
  , data=subset(dat1, woman==1))
summary(aic2b)
aic2b2<-lm(snational ~ pl_estimate +  I(pl_estimate^2) 
  , data=subset(dat1, woman==1))
summary(aic2b2)

AIC(aic2b, aic2b2) ## = smaller for quadratic model

### and for men 

aic2c<-lm(snational ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==0))
summary(aic2c)
aic2c2<-lm(snational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==0))
summary(aic2c2)
AIC(aic2c, aic2c2) ## AIC is smaller including quadratic 

aic2d<-lm(snational ~ pl_estimate 
  , data=subset(dat1, woman==0))
summary(aic2d)
aic2d2<-lm(snational ~ pl_estimate +  I(pl_estimate^2) 
  , data=subset(dat1, woman==0))
summary(aic2d2)

AIC(aic2d, aic2d2) ## = smaller not including quadratic model

### International Issues

aic3a<-lm(sinternational ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==1))
summary(aic3a)
aic3a2<-lm(sinternational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==1))
summary(aic3a2)

AIC(aic3a, aic3a2) ## smaller with quadratic

aic3b<-lm(sinternational ~  pl_estimate 
  , data=subset(dat1, woman==1))
summary(aic3b)
aic3b2<-lm(sinternational ~  pl_estimate +  I(pl_estimate^2)
  , data=subset(dat1, woman==1))
summary(aic3b2)

AIC(aic3b, aic3b2) ## smaller with quadratic 

### and for men 

aic3c<-lm(sinternational ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==0))
summary(aic3c)
aic3c2<-lm(sinternational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==0))
summary(aic3c2)
AIC(aic3c, aic3c2) ## smaller with quadratic 

aic3d<-lm(sinternational ~  pl_estimate 
  , data=subset(dat1, woman==0))
summary(aic3d)
aic3d2<-lm(sinternational ~  pl_estimate +  I(pl_estimate^2)
  , data=subset(dat1, woman==0))
summary(aic3d2)

AIC(aic3d, aic3d2) ## smaller without quadratic 


### Interest in inflation / prices 

aic7a<-lm(interest_prices ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==1 ))
summary(aic7a)
aic7a2<-lm(interest_prices~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==1 ))
summary(aic7a2)

AIC(aic7a, aic7a2) ### quadratic = smallest

aic7b<-lm(interest_prices ~ pl_estimate  
  , data=subset(dat1, woman==1 ))
summary(aic7b)
aic7b2<-lm(interest_prices~ pl_estimate +  I(pl_estimate^2)
  , data=subset(dat1, woman==1 ))
summary(aic7b2)

AIC(aic7b, aic7b2)
### smaller with quadratic

### for men 

aic7c<-lm(interest_prices~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==0))
summary(aic7c)
aic7c2<-lm(interest_prices~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==0))
summary(aic7c2)
AIC(aic7c, aic7c2) ## AIC is smaller with quadratic 

aic7d<-lm(interest_prices ~ pl_estimate  
  , data=subset(dat1, woman==0 ))
summary(aic7d)
aic7d2<-lm(interest_prices~ pl_estimate +  I(pl_estimate^2)
  , data=subset(dat1, woman==0 ))
summary(aic7d2)

AIC(aic7d, aic7d2)
### smaller with no quadratic

### Interest in gun control 

aic8a<-lm(interest_guns ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==1 ))
summary(aic8a)
aic8a2<-lm(interest_guns ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==1))
summary(aic8a2)

AIC(aic8a, aic8a2) ### not smaller with quadratic

aic8b<-lm(interest_guns ~pl_estimate
  , data=subset(dat1, woman==1 ))
summary(aic8b)
aic8b2<-lm(interest_guns ~ pl_estimate +  I(pl_estimate^2)
  , data=subset(dat1, woman==1))
summary(aic8b2)

AIC(aic8b, aic8b2) ### do not need quadratic 

### for men 
aic8c<-lm(interest_guns ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==0))
summary(aic8c)
aic8c2<-lm(interest_guns ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==0))
summary(aic8c2)
AIC(aic8c, aic8c2) ## AIC is smaller with quadratic 

aic8d<-lm(interest_guns ~pl_estimate
  , data=subset(dat1, woman==0 ))
summary(aic8d)
aic8d2<-lm(interest_guns ~ pl_estimate +  I(pl_estimate^2)
  , data=subset(dat1, woman==0))
summary(aic8d2)

AIC(aic8d, aic8d2) ## do not need quadratic 

### Interest in abortion 

aic9a<-lm(interest_abortion ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==1 ))
summary(aic9a)
aic9a2<-lm(interest_abortion ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==1 ))
summary(aic9a2)

AIC(aic9a, aic9a2) ### no quadratic needed 

aic9b<-lm(interest_abortion ~ pl_estimate 
  , data=subset(dat1, woman==1 ))
summary(aic9b)
aic9b2<-lm(interest_abortion ~ pl_estimate +  I(pl_estimate^2)
  , data=subset(dat1, woman==1 ))
summary(aic9b2)

AIC(aic9b, aic9b2) ### smaller with quadratic


### for men 
aic9c<-lm(interest_abortion ~ p_m_load_share_relevant2  
  , data=subset(dat1, woman==0))
summary(aic9c)
aic9c2<-lm(interest_abortion ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) 
  , data=subset(dat1, woman==0))
summary(aic9c2)
AIC(aic9c, aic9c2) ## no quadratic needed  

aic9d<-lm(interest_abortion ~ pl_estimate 
  , data=subset(dat1, woman==0))
summary(aic9d)
aic9d2<-lm(interest_abortion ~ pl_estimate +  I(pl_estimate^2)
  , data=subset(dat1, woman==0))
summary(aic9d2)

AIC(aic9d, aic9d2) ### quadratic smaller 


#####################
##################### 
## Appendix Tables C6 and C7 (dropping those with no partner)  
#####################
#####################

########################
## First mothers
########################

md2bz<-lm(snational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1 & partner==1))
summary(md2bz) 

avg_slopes(md2bz, newdata = datagrid(p_m_load_share_relevant2 =  1))

md4bz<-lm(sinterest_prices ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1 & partner==1))
summary(md4bz) 

## negative effect above 88% remains the same
avg_slopes(md4bz, newdata = datagrid(p_m_load_share_relevant2 =  0.88))


md6bz<-lm(sinterest_guns ~ p_m_load_share_relevant2 + pl_estimate + 
 highered + empinc + age_range +
num_children + toddler +
    Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1 & partner==1))
summary(md6bz) ### effect remains the same, similar size


library(stargazer)
stargazer(md2bz,md4bz,md6bz, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))


#######################
## Then fathers
####################### 


md4b2z<-lm(sinterest_prices ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate  + 
 highered + empinc + age_range +
num_children + toddler +
  Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==0 & partner==1))
summary(md4b2z) 

###  negative effect around 83% of mental load 
avg_slopes(md4b2z, newdata = datagrid(p_m_load_share_relevant2 =  0.83))

stargazer(md4b2z, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))

#############################
#### Ordered logistic, Appendix Tables C8 and C9
#############################

### Replicate results using ordered logistic regression -- mothers

model11 <- polr(flocal ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1), Hess=TRUE)
summary(model11)
ctable <- coef(summary(model11))
p <- pnorm(abs(ctable[, "t value"]), lower.tail = FALSE) * 2
ctable <- cbind(ctable, "p value" = p)
ctable 

model11a <- polr(fnational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1), Hess=TRUE)
summary(model11a)
ctable <- coef(summary(model11a))
p <- pnorm(abs(ctable[, "t value"]), lower.tail = FALSE) * 2
ctable <- cbind(ctable, "p value" = p)
ctable 


model11aa <- polr(finternational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==1), Hess=TRUE)
summary(model11aa)
ctable <- coef(summary(model11aa))
p <- pnorm(abs(ctable[, "t value"]), lower.tail = FALSE) * 2
ctable <- cbind(ctable, "p value" = p)
ctable 

#### Now fathers 

model11b <- polr(flocal ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==0), Hess=TRUE)
summary(model11)
ctable <- coef(summary(model11b))
p <- pnorm(abs(ctable[, "t value"]), lower.tail = FALSE) * 2
ctable <- cbind(ctable, "p value" = p)
ctable 

model11bb <- polr(fnational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==0), Hess=TRUE)
ctable <- coef(summary(model11bb))
p <- pnorm(abs(ctable[, "t value"]), lower.tail = FALSE) * 2
ctable <- cbind(ctable, "p value" = p)
ctable 

model11c <- polr(finternational ~ p_m_load_share_relevant2 +  I(p_m_load_share_relevant2^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat1, woman==0), Hess=TRUE)
summary(model11c)
ctable <- coef(summary(model11c))
p <- pnorm(abs(ctable[, "t value"]), lower.tail = FALSE) * 2
ctable <- cbind(ctable, "p value" = p)
ctable 

###############################
######### Appendix Table C8 ###
###############################

### Interactions

mod1z <- lm(slocal ~ p_m_load_share_relevant2 * woman + I(p_m_load_share_relevant2^2) * woman + 
             pl_estimate + I(pl_estimate^2) + highered + empinc + age_range + num_children + 
             toddler + partner + Democrat + black + asian + mixed_other_race + lgbt, data=dat1)
summary(mod1z)

mod2z <- lm(snational ~ p_m_load_share_relevant2 * woman + I(p_m_load_share_relevant2^2) * woman + 
             pl_estimate + I(pl_estimate^2) + highered + empinc + age_range + num_children + 
             toddler + partner + Democrat + black + asian + mixed_other_race + lgbt, data=dat1)
summary(mod2z)

mod3z <- lm(sinternational ~ p_m_load_share_relevant2 * woman + I(p_m_load_share_relevant2^2) * woman + 
             pl_estimate + I(pl_estimate^2) + highered + empinc + age_range + num_children + 
             toddler + partner + Democrat + black + asian + mixed_other_race + lgbt, data=dat1)
summary(mod3z)

mod4z <- lm(sinterest_prices ~ p_m_load_share_relevant2 * woman + I(p_m_load_share_relevant2^2) * woman + 
             pl_estimate + I(pl_estimate^2) + highered + empinc + age_range + num_children + 
             toddler + partner + Democrat + black + asian + mixed_other_race + lgbt, data=dat1)
summary(mod4z)

### Don't need quadratic for abortion ? still not sign

mod5z <- lm(sinterest_abortion ~ p_m_load_share_relevant2 * woman +  
             pl_estimate + I(pl_estimate^2) + highered + empinc + age_range + num_children + 
             toddler + partner + Democrat + black + asian + mixed_other_race + lgbt, data=dat1)
summary(mod5z)

mod6z <- lm(sinterest_guns ~ p_m_load_share_relevant2 * woman + I(p_m_load_share_relevant2^2) * woman + 
             pl_estimate + I(pl_estimate^2) + highered + empinc + age_range + num_children + 
             toddler + partner + Democrat + black + asian + mixed_other_race + lgbt, data=dat1)
summary(mod6z)

stargazer(mod1z, mod2z, mod3z, mod4z, mod5z, mod6z, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))

#### Try also without quadratic term -- here sig at .1 level suggesting that mental load impacts women 
### differently? 
mod6z <- lm(sinterest_guns ~ p_m_load_share_relevant2 * woman + 
             pl_estimate + I(pl_estimate^2) + highered + empinc + age_range + num_children + 
             toddler + partner + Democrat + black + asian + mixed_other_race + lgbt, data=dat1)
summary(mod6z)

####################################
########## Robustness check: use full range of response scale for ML
########## Tables C11-C12

dat2<-dat1

map_response <- function(response) {
  if (is.na(response)) {
    return(NA)
  }
  switch(response,
         "Mostly my partner" = 0,
         "Partner and I share equally" = .5,
         "Mostly me" = 1,
         "Someone else (includes friends and family)" = 0,
         NA)
}

variables <- c("Q34_1", "Q34_2", "Q34_3", "Q36_1", "Q36_2", "Q36_3", 
               "Q37_1", "Q37_2", "Q37_3", "Q38_1", "Q38_2", 
               "Q38_3", "Q39_1", "Q39_2", "Q39_3", "Q40_1.1", 
               "Q40_2", "Q40_3", "Q41_1", "Q41_2", "Q41_3")

for (var in variables) {
  if (var %in% names(dat1)) {
    dat2[[paste0(var, "_ordinal")]] <- sapply(dat2[[var]], map_response)
  }
}

##### Now create a new share mental load variable that gives .5 for sharing load 
##### (but 1 is still max possible for each item, so denominator remains the same)

dat2$p_m_load_scale <- 
dat2$Q34_1_ordinal + dat2$Q34_2_ordinal + dat2$Q34_3_ordinal + 
dat2$Q36_1_ordinal + dat2$Q36_2_ordinal + dat2$Q36_3_ordinal + 
dat2$Q37_1_ordinal + dat2$Q37_2_ordinal + dat2$Q37_3_ordinal +
dat2$Q38_1_ordinal + dat2$Q38_2_ordinal + dat2$Q38_3_ordinal + 
dat2$Q39_1_ordinal + dat2$Q39_2_ordinal + dat2$Q39_3_ordinal + 
dat2$Q40_1.1_ordinal + dat2$Q40_2_ordinal + dat2$Q40_3_ordinal +
dat2$Q41_1_ordinal + dat2$Q41_2_ordinal + dat2$Q41_3_ordinal 

table(dat2$p_m_load_scale) ## max is 21

table(dat2$p_m_load_relevant_2) ### this is the number of 21 items that are not NA for each respondent (denominator)
## max is 21 

dat2$p_m_load_share_relevant_scale<-dat2$p_m_load_scale / dat2$p_m_load_relevant_2
table(dat2$p_m_load_share_relevant_scale) 

### ranges from 0 to 1
table(dat2$p_m_load_share_relevant2) ## like the original scale 

 mean(dat2$p_m_load_share_relevant_scale[dat2$woman==1], na.rm=TRUE) 
 mean(dat2$p_m_load_share_relevant_scale[dat2$woman==0], na.rm=TRUE)
 
### 80 for women, vs 71 original (+9 points)
### 60 for men, vs 45 original (+15 points)

 mean(dat2$p_m_load_share_relevant2[dat2$woman==1], na.rm=TRUE) 
 mean(dat2$p_m_load_share_relevant2[dat2$woman==0], na.rm=TRUE) 

md1b_s<-lm(slocal ~ p_m_load_share_relevant_scale +  I(p_m_load_share_relevant_scale^2) + pl_estimate  +  I(pl_estimate^2) +
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==1))
summary(md1b_s)  ##robust

md2b_s<-lm(snational ~ p_m_load_share_relevant_scale +  I(p_m_load_share_relevant_scale^2)+ pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==1))
summary(md2b_s) ##NS -- but pattern is similar 

md3b_s<-lm(sinternational ~ p_m_load_share_relevant_scale +  I(p_m_load_share_relevant_scale^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==1))
summary(md3b_s) ##robust

md4b_s<-lm(sinterest_prices ~ p_m_load_share_relevant_scale +  I(p_m_load_share_relevant_scale^2) + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==1))
summary(md4b_s) ## siginificant 

md5b_s<-lm(sinterest_abortion ~ p_m_load_share_relevant_scale  + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==1))
summary(md5b_s) ##robust

md6b_s<-lm(sinterest_guns ~ p_m_load_share_relevant_scale + pl_estimate + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==1))
summary(md6b_s) ## sig at .1 level 

library(stargazer)
stargazer(md1b_s,md2b_s,md3b_s,md4b_s,md5b_s,md6b_s, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c( .05, .01, .001))

###################### Now among men 

md1b2_s<-lm(slocal ~ p_m_load_share_relevant_scale +  I(p_m_load_share_relevant_scale^2) + pl_estimate +   
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==0))
summary(md1b2_s) ## robust

md2b2_s<-lm(snational ~ p_m_load_share_relevant_scale +  I(p_m_load_share_relevant_scale^2) + pl_estimate +   highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==0))
summary(md2b2_s) ## not robust but similar pattern

md3b2_s<-lm(sinternational ~ p_m_load_share_relevant_scale +  I(p_m_load_share_relevant_scale^2) + pl_estimate  + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==0))
summary(md3b2_s) ## interest not increasing at low level here (low level is moved up)

md4b2_s<-lm(sinterest_prices ~ p_m_load_share_relevant_scale +  I(p_m_load_share_relevant_scale^2) + pl_estimate  + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==0))
summary(md4b2_s) ## robust

md5b2_s<-lm(sinterest_abortion ~ p_m_load_share_relevant_scale + pl_estimate +  I(pl_estimate^2) + 
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==0))
summary(md5b2_s) ## robust

md6b2_s<-lm(sinterest_guns ~ p_m_load_share_relevant_scale +  I(p_m_load_share_relevant_scale^2) + pl_estimate +   
 highered + empinc + age_range +
num_children + toddler +
   partner + Democrat +
black + asian + mixed_other_race + lgbt
 , data=subset(dat2, woman==0))
summary(md6b2_s) ## robust

stargazer(md1b2_s,md2b2_s,md3b2_s,md4b2_s,md5b2_s,md6b2_s, title="Regression Results",
align=TRUE,
omit.stat=c("LL","ser","f"), no.space=TRUE, column.sep.width = "1pt", 
          font.size = "small" , star.cutoffs = c(.05, .01, .001))



